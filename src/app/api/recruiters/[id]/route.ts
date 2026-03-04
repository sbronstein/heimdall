import { db } from '@/lib/db';
import { recruiters } from '../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { z } from 'zod';

const updateRecruiterSchema = z.object({
  firm: z.string().optional().nullable(),
  specialty: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  engagementStatus: z.string().optional().nullable(),
  lastSubmittedTo: z.string().optional().nullable(),
  qualityRating: z.number().int().min(1).max(5).optional().nullable(),
  notes: z.string().optional().nullable()
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [recruiter] = await db
      .select()
      .from(recruiters)
      .where(eq(recruiters.id, id));

    if (!recruiter) return notFound('Recruiter');
    return success(recruiter);
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
    const validated = updateRecruiterSchema.parse(body);

    const [updated] = await db
      .update(recruiters)
      .set({ ...validated, updatedAt: new Date() })
      .where(eq(recruiters.id, id))
      .returning();

    if (!updated) return notFound('Recruiter');
    return success(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [deleted] = await db
      .delete(recruiters)
      .where(eq(recruiters.id, id))
      .returning();

    if (!deleted) return notFound('Recruiter');
    return success({ deleted: true });
  } catch (err) {
    return serverError(err);
  }
}
