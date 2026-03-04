import { db } from '@/lib/db';
import { notes } from '../../../../drizzle/schema';
import { desc, isNull, ilike, lt, sql } from 'drizzle-orm';
import { created, paginated } from '@/lib/api/types';
import { serverError, validationError } from '@/lib/api/errors';
import { parseCursor, parseLimit } from '@/lib/api/filters';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';

const createNoteSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  category: z.string().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
  applicationId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional().nullable()
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const cursor = parseCursor(searchParams.get('cursor'));
    const search = searchParams.get('search');
    const category = searchParams.get('category');

    const conditions = [isNull(notes.archivedAt)];

    if (search) {
      conditions.push(
        sql`(${ilike(notes.title, `%${search}%`)} OR ${ilike(notes.content, `%${search}%`)})`
      );
    }
    if (category) {
      conditions.push(sql`${notes.category} = ${category}`);
    }
    if (cursor) {
      conditions.push(lt(notes.updatedAt, cursor));
    }

    const where = conditions.length > 1
      ? sql`${sql.join(conditions.map((c) => sql`(${c})`), sql` AND `)}`
      : conditions[0];

    const results = await db
      .select()
      .from(notes)
      .where(where)
      .orderBy(desc(notes.updatedAt))
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
    const validated = createNoteSchema.parse(body);

    const [note] = await db.insert(notes).values(validated).returning();

    await logTimeline({
      eventType: 'note_created',
      title: `Created note: ${validated.title}`,
      noteId: note.id,
      companyId: validated.companyId || undefined,
      contactId: validated.contactId || undefined,
      applicationId: validated.applicationId || undefined
    });

    return created(note);
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}
