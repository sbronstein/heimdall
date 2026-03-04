import { db } from '@/lib/db';
import { interactions, contacts } from '../../../../drizzle/schema';
import { desc, eq, lt, sql } from 'drizzle-orm';
import { created, paginated } from '@/lib/api/types';
import { serverError, validationError } from '@/lib/api/errors';
import { parseCursor, parseLimit } from '@/lib/api/filters';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import { interactionTypeValues, interactionSentimentValues } from '@/lib/domain/types';

const createInteractionSchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  applicationId: z.string().uuid().optional().nullable(),
  type: z.enum(interactionTypeValues),
  direction: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  sentiment: z.enum(interactionSentimentValues).optional().nullable(),
  occurredAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().optional().nullable(),
  followUpRequired: z.boolean().optional(),
  followUpDate: z.string().datetime().optional().nullable(),
  tags: z.array(z.string()).optional().nullable()
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const cursor = parseCursor(searchParams.get('cursor'));

    const conditions = [];
    if (cursor) {
      conditions.push(lt(interactions.occurredAt, cursor));
    }

    const where = conditions.length > 0
      ? sql`${sql.join(conditions.map((c) => sql`(${c})`), sql` AND `)}`
      : undefined;

    const results = await db
      .select()
      .from(interactions)
      .where(where)
      .orderBy(desc(interactions.occurredAt))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    return paginated(data, {
      cursor: data.length > 0 ? data[data.length - 1].occurredAt.toISOString() : null,
      hasMore
    });
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = createInteractionSchema.parse(body);

    const values = {
      ...validated,
      occurredAt: validated.occurredAt ? new Date(validated.occurredAt) : new Date(),
      followUpDate: validated.followUpDate ? new Date(validated.followUpDate) : null
    };

    const [interaction] = await db.insert(interactions).values(values).returning();

    // Auto-update contact's lastContactDate and nextFollowUpDate
    if (validated.contactId) {
      const contactUpdate: Record<string, unknown> = {
        lastContactDate: new Date(),
        updatedAt: new Date()
      };
      if (validated.followUpRequired && validated.followUpDate) {
        contactUpdate.nextFollowUpDate = new Date(validated.followUpDate);
      }
      await db
        .update(contacts)
        .set(contactUpdate)
        .where(eq(contacts.id, validated.contactId));
    }

    await logTimeline({
      eventType: 'interaction_logged',
      title: `${validated.type.replace(/_/g, ' ')}: ${validated.subject || 'No subject'}`,
      interactionId: interaction.id,
      contactId: validated.contactId || undefined,
      companyId: validated.companyId || undefined,
      applicationId: validated.applicationId || undefined
    });

    return created(interaction);
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}
