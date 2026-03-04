import { db } from '@/lib/db';
import { recruiters, contacts } from '../../../../drizzle/schema';
import { desc, eq, ilike, sql } from 'drizzle-orm';
import { success, created, paginated } from '@/lib/api/types';
import { serverError, validationError } from '@/lib/api/errors';
import { parseLimit } from '@/lib/api/filters';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';

const createRecruiterSchema = z.object({
  contactId: z.string().uuid(),
  firm: z.string().optional().nullable(),
  specialty: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  engagementStatus: z.string().optional().nullable(),
  lastSubmittedTo: z.string().optional().nullable(),
  qualityRating: z.number().int().min(1).max(5).optional().nullable(),
  notes: z.string().optional().nullable()
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const search = searchParams.get('search');

    const results = await db
      .select({
        id: recruiters.id,
        contactId: recruiters.contactId,
        firm: recruiters.firm,
        specialty: recruiters.specialty,
        region: recruiters.region,
        engagementStatus: recruiters.engagementStatus,
        lastSubmittedTo: recruiters.lastSubmittedTo,
        qualityRating: recruiters.qualityRating,
        notes: recruiters.notes,
        createdAt: recruiters.createdAt,
        updatedAt: recruiters.updatedAt,
        contactName: sql<string>`concat(${contacts.firstName}, ' ', ${contacts.lastName})`,
        contactEmail: contacts.email,
        contactTitle: contacts.title
      })
      .from(recruiters)
      .leftJoin(contacts, eq(recruiters.contactId, contacts.id))
      .where(
        search
          ? sql`(${ilike(contacts.firstName, `%${search}%`)} OR ${ilike(contacts.lastName, `%${search}%`)} OR ${ilike(recruiters.firm, `%${search}%`)})`
          : undefined
      )
      .orderBy(desc(recruiters.updatedAt))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    return paginated(data, { hasMore });
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = createRecruiterSchema.parse(body);

    const [recruiter] = await db
      .insert(recruiters)
      .values(validated)
      .returning();

    await logTimeline({
      eventType: 'recruiter_added',
      title: `Added recruiter profile`,
      contactId: validated.contactId
    });

    return created(recruiter);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
