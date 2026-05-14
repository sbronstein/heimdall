import { db } from '@/lib/db';
import { jobLeads } from '../../../../drizzle/schema';
import { desc, inArray, isNull, lt, sql, eq } from 'drizzle-orm';
import { created, paginated } from '@/lib/api/types';
import { serverError, validationError } from '@/lib/api/errors';
import { parseArrayParam, parseCursor, parseLimit } from '@/lib/api/filters';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import { scrapeJobPage } from '@/features/job-leads/lib/scrape-job-page';
import { companies } from '../../../../drizzle/schema';
import { jobLeadStatusValues } from '@/lib/domain/types';

const createJobLeadSchema = z.object({
  linkedinJobUrl: z.string().url()
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const cursor = parseCursor(searchParams.get('cursor'));
    const statuses = parseArrayParam(searchParams.get('status'));

    const conditions = [isNull(jobLeads.archivedAt)];

    if (statuses) {
      conditions.push(
        inArray(
          jobLeads.status,
          statuses as (typeof jobLeadStatusValues)[number][]
        )
      );
    }

    if (cursor) {
      conditions.push(lt(jobLeads.updatedAt, cursor));
    }

    const where =
      conditions.length > 1
        ? sql`${sql.join(conditions.map((c) => sql`(${c})`), sql` AND `)}`
        : conditions[0];

    const results = await db
      .select()
      .from(jobLeads)
      .where(where)
      .orderBy(desc(jobLeads.updatedAt))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    return paginated(data, {
      cursor:
        data.length > 0
          ? data[data.length - 1].updatedAt.toISOString()
          : null,
      hasMore
    });
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = createJobLeadSchema.parse(body);

    // Create the lead in pending state
    const [lead] = await db
      .insert(jobLeads)
      .values({
        linkedinJobUrl: validated.linkedinJobUrl,
        status: 'scraping'
      })
      .returning();

    // Scrape the job page
    try {
      const scraped = await scrapeJobPage(validated.linkedinJobUrl);

      // Try to match company
      let companyId: string | null = null;
      if (scraped.companyName) {
        const [match] = await db
          .select()
          .from(companies)
          .where(
            sql`lower(${companies.name}) = lower(${scraped.companyName})`
          )
          .limit(1);
        if (match) companyId = match.id;
      }

      const [updated] = await db
        .update(jobLeads)
        .set({
          roleTitle: scraped.roleTitle,
          companyName: scraped.companyName,
          companyId,
          scrapedData: scraped,
          status: 'scraped',
          updatedAt: new Date()
        })
        .where(eq(jobLeads.id, lead.id))
        .returning();

      await logTimeline({
        eventType: 'job_lead_created',
        title: `New job lead: ${scraped.roleTitle || 'Unknown Role'} at ${scraped.companyName || 'Unknown Company'}`,
        companyId: companyId || undefined,
        metadata: { jobLeadId: lead.id }
      });

      return created(updated);
    } catch (scrapeErr) {
      // Scrape failed — still return the lead in pending state
      console.error('Job page scrape failed:', scrapeErr);
      await db
        .update(jobLeads)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(eq(jobLeads.id, lead.id));

      return created(lead);
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
