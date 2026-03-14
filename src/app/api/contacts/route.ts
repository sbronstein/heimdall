import { db } from '@/lib/db';
import { contacts } from '../../../../drizzle/schema';
import { desc, isNull, inArray, ilike, lt, sql } from 'drizzle-orm';
import { created, paginated } from '@/lib/api/types';
import { serverError, validationError } from '@/lib/api/errors';
import { parseArrayParam, parseCursor, parseLimit } from '@/lib/api/filters';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import {
  contactRelationshipValues,
  contactWarmthValues,
  contactClosenessValues,
  outreachStatusValues
} from '@/lib/domain/types';

const createContactSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable(),
  title: z.string().optional().nullable(),
  currentCompany: z.string().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  relationship: z.enum(contactRelationshipValues).optional(),
  warmth: z.enum(contactWarmthValues).optional(),
  closeness: z.enum(contactClosenessValues).optional(),
  outreachStatus: z.enum(outreachStatusValues).optional(),
  outreachDate: z.union([z.string().date(), z.string().datetime()]).optional().nullable(),
  introducedBy: z.string().uuid().optional().nullable(),
  linkedinConnectionDate: z.union([z.string().date(), z.string().datetime()]).optional().nullable(),
  importSource: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  howMet: z.string().optional().nullable(),
  metDate: z.union([z.string().date(), z.string().datetime()]).optional().nullable(),
  nextFollowUpDate: z.union([z.string().date(), z.string().datetime()]).optional().nullable(),
  followUpNotes: z.string().optional().nullable()
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const cursor = parseCursor(searchParams.get('cursor'));
    const warmths = parseArrayParam(searchParams.get('warmth'));
    const relationships = parseArrayParam(searchParams.get('relationship'));
    const closenessFilter = parseArrayParam(searchParams.get('closeness'));
    const outreachStatusFilter = parseArrayParam(searchParams.get('outreachStatus'));
    const search = searchParams.get('search');

    const conditions = [isNull(contacts.archivedAt)];

    if (warmths) {
      conditions.push(inArray(contacts.warmth, warmths as typeof contactWarmthValues[number][]));
    }
    if (relationships) {
      conditions.push(inArray(contacts.relationship, relationships as typeof contactRelationshipValues[number][]));
    }
    if (closenessFilter) {
      conditions.push(inArray(contacts.closeness, closenessFilter as typeof contactClosenessValues[number][]));
    }
    if (outreachStatusFilter) {
      conditions.push(inArray(contacts.outreachStatus, outreachStatusFilter as typeof outreachStatusValues[number][]));
    }
    if (search) {
      conditions.push(
        sql`(${ilike(contacts.firstName, `%${search}%`)} OR ${ilike(contacts.lastName, `%${search}%`)})`
      );
    }
    if (cursor) {
      conditions.push(lt(contacts.updatedAt, cursor));
    }

    const where =
      conditions.length > 1
        ? sql`${sql.join(conditions.map((c) => sql`(${c})`), sql` AND `)}`
        : conditions[0];

    const results = await db
      .select()
      .from(contacts)
      .where(where)
      .orderBy(desc(contacts.updatedAt))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    return paginated(data, {
      cursor: data.length > 0 ? data[data.length - 1].updatedAt.toISOString() : null,
      hasMore
    });
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = createContactSchema.parse(body);

    const values = {
      ...validated,
      nextFollowUpDate: validated.nextFollowUpDate
        ? new Date(validated.nextFollowUpDate)
        : null,
      outreachDate: validated.outreachDate
        ? new Date(validated.outreachDate)
        : null,
      linkedinConnectionDate: validated.linkedinConnectionDate
        ? new Date(validated.linkedinConnectionDate)
        : null,
      metDate: validated.metDate
        ? new Date(validated.metDate)
        : null,
      importedAt: validated.importSource ? new Date() : null
    };

    const [contact] = await db.insert(contacts).values(values).returning();

    await logTimeline({
      eventType: 'contact_added',
      title: `Added ${validated.firstName} ${validated.lastName} (${validated.relationship || 'contact'})`,
      contactId: contact.id,
      companyId: validated.companyId || undefined
    });

    return created(contact);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
