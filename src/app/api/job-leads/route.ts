import { db } from '@/lib/db';
import { jobLeads } from '../../../../drizzle/schema';
import { and, desc, inArray, isNull, lt, sql, eq } from 'drizzle-orm';
import { created, paginated, success } from '@/lib/api/types';
import { serverError, validationError } from '@/lib/api/errors';
import { parseArrayParam, parseCursor, parseLimit } from '@/lib/api/filters';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import { scrapeJobPage } from '@/features/job-leads/lib/scrape-job-page';
import { companies } from '../../../../drizzle/schema';
import {
  COMPANY_SCOPE_ROLE_TITLE,
  jobLeadStatusValues
} from '@/lib/domain/types';

const createJobLeadSchema = z.union([
  z.object({ linkedinJobUrl: z.string().url() }),
  z.object({
    companyName: z.string().min(1).max(200),
    linkedinCompanyUrl: z.string().url().optional()
  })
]);

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

// POST /api/job-leads
//
// Accepts a discriminated body (Zod z.union — first-match-wins):
//   1. { linkedinJobUrl }                            — existing job-URL flow (scrapes immediately)
//   2. { companyName, linkedinCompanyUrl? }          — company-scope flow (D-01..D-04, D-07..D-09, D-13..D-15)
//
// If a body matches BOTH shapes (e.g., both linkedinJobUrl and companyName present),
// the union resolves to shape (1) — the job-URL branch — because z.union returns
// the first-successful parse.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = createJobLeadSchema.parse(body);

    if ('linkedinJobUrl' in validated) {
      // ─── Existing job-URL branch ───────────────────────────────────────
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
    }

    // ─── Company-scope branch (D-01..D-04, D-07..D-09, D-13..D-15) ────────
    // Lookup-or-create company (D-07, D-08, D-09)
    const [match] = await db
      .select()
      .from(companies)
      .where(sql`lower(${companies.name}) = lower(${validated.companyName})`)
      .limit(1);

    let companyId: string;
    if (match) {
      companyId = match.id;
      // D-09: backfill linkedinUrl if missing AND request supplied one;
      // never overwrite a non-null linkedinUrl (protects user-curated data)
      if (match.linkedinUrl == null && validated.linkedinCompanyUrl) {
        await db
          .update(companies)
          .set({
            linkedinUrl: validated.linkedinCompanyUrl,
            updatedAt: new Date()
          })
          .where(eq(companies.id, match.id));
      }
    } else {
      // D-08: auto-create minimum stub; schema defaults supply
      // priority/stage/status/remotePolicy
      const [createdCompany] = await db
        .insert(companies)
        .values({
          name: validated.companyName,
          linkedinUrl: validated.linkedinCompanyUrl ?? null
        })
        .returning();
      companyId = createdCompany.id;
    }

    // D-13/D-14: idempotent dedup against in-flight company-scope leads
    const [existing] = await db
      .select()
      .from(jobLeads)
      .where(
        and(
          eq(jobLeads.companyId, companyId),
          isNull(jobLeads.linkedinJobUrl),
          inArray(jobLeads.status, ['queued', 'searching', 'failed']),
          isNull(jobLeads.archivedAt)
        )
      )
      .limit(1);
    if (existing) return success(existing); // 200, not 201 (D-13)

    // D-03/D-10/D-11: insert new company-scope lead at status='queued'
    const [lead] = await db
      .insert(jobLeads)
      .values({
        linkedinJobUrl: null,
        roleTitle: COMPANY_SCOPE_ROLE_TITLE,
        companyName: validated.companyName,
        companyId,
        status: 'queued'
      })
      .returning();

    // D-04: reuse job_lead_created event with metadata.scope='company'
    await logTimeline({
      eventType: 'job_lead_created',
      title: `Company scrape: ${validated.companyName}`,
      companyId,
      metadata: { jobLeadId: lead.id, scope: 'company' }
    });

    return created(lead);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
