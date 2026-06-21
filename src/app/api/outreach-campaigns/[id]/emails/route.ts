import { db } from '@/lib/db';
import {
  outreachEmails,
  contacts,
  outreachCampaigns
} from '../../../../../../drizzle/schema';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { created, paginated } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { parseArrayParam, parseCursor, parseLimit } from '@/lib/api/filters';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import { outreachEmailStatusValues } from '@/lib/domain/types';

const bulkAddEmailsSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(500)
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const cursor = parseCursor(searchParams.get('cursor'));
    const statuses = parseArrayParam(searchParams.get('status'));

    const conditions = [eq(outreachEmails.campaignId, id)];

    if (statuses) {
      conditions.push(
        inArray(
          outreachEmails.status,
          statuses as (typeof outreachEmailStatusValues)[number][]
        )
      );
    }

    if (cursor) {
      conditions.push(lt(outreachEmails.updatedAt, cursor));
    }

    const where =
      conditions.length > 1
        ? sql`${sql.join(
            conditions.map((c) => sql`(${c})`),
            sql` AND `
          )}`
        : conditions[0];

    const results = await db
      .select({ email: outreachEmails, contact: contacts })
      .from(outreachEmails)
      .leftJoin(contacts, eq(outreachEmails.contactId, contacts.id))
      .where(where)
      .orderBy(desc(outreachEmails.updatedAt))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    return paginated(data, {
      cursor:
        data.length > 0
          ? data[data.length - 1].email.updatedAt.toISOString()
          : null,
      hasMore
    });
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = bulkAddEmailsSchema.parse(body);

    // Verify campaign exists
    const [campaign] = await db
      .select()
      .from(outreachCampaigns)
      .where(eq(outreachCampaigns.id, id))
      .limit(1);

    if (!campaign) return notFound('Campaign');

    const rows = validated.contactIds.map((contactId) => ({
      campaignId: id,
      contactId,
      status: 'pending' as const
    }));

    const inserted = await db
      .insert(outreachEmails)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: outreachEmails.id });

    const insertedCount = inserted.length;
    const skipped = validated.contactIds.length - insertedCount;

    await logTimeline({
      eventType: 'outreach_emails_added',
      title: `Added ${insertedCount} contacts to ${campaign.name}`,
      metadata: { campaignId: id, inserted: insertedCount, skipped }
    });

    return created({ inserted: insertedCount, skipped });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
