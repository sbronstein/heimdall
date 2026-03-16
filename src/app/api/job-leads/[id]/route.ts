import { db } from '@/lib/db';
import { jobLeads } from '../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import { jobLeadStatusValues } from '@/lib/domain/types';

const updateJobLeadSchema = z.object({
  status: z.enum(jobLeadStatusValues).optional(),
  applicationId: z.string().uuid().optional().nullable(),
  companyId: z.string().uuid().optional().nullable()
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [lead] = await db
      .select()
      .from(jobLeads)
      .where(eq(jobLeads.id, id))
      .limit(1);

    if (!lead) return notFound('Job lead');

    return success(lead);
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
    const validated = updateJobLeadSchema.parse(body);

    const [updated] = await db
      .update(jobLeads)
      .set({
        ...validated,
        updatedAt: new Date()
      })
      .where(eq(jobLeads.id, id))
      .returning();

    if (!updated) return notFound('Job lead');

    if (validated.status) {
      await logTimeline({
        eventType: 'job_lead_updated',
        title: `Job lead status changed to ${validated.status}`,
        companyId: updated.companyId || undefined,
        metadata: { jobLeadId: id }
      });
    }

    return success(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
