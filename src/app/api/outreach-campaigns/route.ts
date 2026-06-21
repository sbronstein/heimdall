import { db } from '@/lib/db';
import { outreachCampaigns, outreachEmails } from '../../../../drizzle/schema';
import { desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { created, paginated } from '@/lib/api/types';
import { serverError, validationError } from '@/lib/api/errors';
import { parseCursor, parseLimit } from '@/lib/api/filters';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  goalInstruction: z.string().min(1)
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const cursor = parseCursor(searchParams.get('cursor'));

    const conditions = [isNull(outreachCampaigns.archivedAt)];

    if (cursor) {
      conditions.push(lt(outreachCampaigns.updatedAt, cursor));
    }

    const where =
      conditions.length > 1
        ? sql`${sql.join(
            conditions.map((c) => sql`(${c})`),
            sql` AND `
          )}`
        : conditions[0];

    // CD-01: per-campaign email counts via a single GROUP BY — no N+1 per campaign
    const results = await db
      .select({
        id: outreachCampaigns.id,
        name: outreachCampaigns.name,
        goalInstruction: outreachCampaigns.goalInstruction,
        status: outreachCampaigns.status,
        createdAt: outreachCampaigns.createdAt,
        updatedAt: outreachCampaigns.updatedAt,
        archivedAt: outreachCampaigns.archivedAt,
        emailCounts: sql<string>`
          json_build_object(
            'pending',   count(*) FILTER (WHERE ${outreachEmails.status} = 'pending'),
            'generated', count(*) FILTER (WHERE ${outreachEmails.status} = 'generated'),
            'edited',    count(*) FILTER (WHERE ${outreachEmails.status} = 'edited'),
            'approved',  count(*) FILTER (WHERE ${outreachEmails.status} = 'approved'),
            'drafted',   count(*) FILTER (WHERE ${outreachEmails.status} = 'drafted'),
            'failed',    count(*) FILTER (WHERE ${outreachEmails.status} = 'failed')
          )`
      })
      .from(outreachCampaigns)
      .leftJoin(
        outreachEmails,
        eq(outreachEmails.campaignId, outreachCampaigns.id)
      )
      .where(where)
      .groupBy(outreachCampaigns.id)
      .orderBy(desc(outreachCampaigns.updatedAt))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    return paginated(data, {
      cursor:
        data.length > 0 ? data[data.length - 1].updatedAt.toISOString() : null,
      hasMore
    });
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = createCampaignSchema.parse(body);

    const [campaign] = await db
      .insert(outreachCampaigns)
      .values({
        name: validated.name,
        goalInstruction: validated.goalInstruction
      })
      .returning();

    await logTimeline({
      eventType: 'outreach_campaign_created',
      title: `Campaign created: ${campaign.name}`,
      metadata: { campaignId: campaign.id }
    });

    return created(campaign);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
