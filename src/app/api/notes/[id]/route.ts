import { db } from '@/lib/db';
import { notes } from '../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';

const updateNoteSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).optional(),
  category: z.string().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
  applicationId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional().nullable()
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [note] = await db.select().from(notes).where(eq(notes.id, id));
    if (!note) return notFound('Note');
    return success(note);
  } catch (err) {
    return serverError(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = updateNoteSchema.parse(body);

    const [note] = await db
      .update(notes)
      .set({ ...validated, updatedAt: new Date() })
      .where(eq(notes.id, id))
      .returning();

    if (!note) return notFound('Note');

    await logTimeline({
      eventType: 'note_updated',
      title: `Updated note: ${note.title}`,
      noteId: note.id
    });

    return success(note);
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [note] = await db
      .update(notes)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(notes.id, id))
      .returning();

    if (!note) return notFound('Note');
    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}
