import { db } from '@/lib/db';
import { applications, companies } from '../../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { canTransition } from '@/lib/domain/pipeline';
import { z } from 'zod';
import { applicationStatusValues } from '@/lib/domain/types';

const statusChangeSchema = z.object({
  status: z.enum(applicationStatusValues)
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status: newStatus } = statusChangeSchema.parse(body);

    // Get current application
    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, id));

    if (!application) return notFound('Application');

    const oldStatus = application.status;

    // Validate transition
    if (!canTransition(oldStatus, newStatus)) {
      return validationError(
        `Invalid transition: ${oldStatus} -> ${newStatus}`
      );
    }

    // Update status
    const [updated] = await db
      .update(applications)
      .set({
        status: newStatus,
        statusChangedAt: new Date(),
        updatedAt: new Date(),
        ...(newStatus === 'applied' && !application.appliedDate
          ? { appliedDate: new Date() }
          : {}),
        lastActivityDate: new Date()
      })
      .where(eq(applications.id, id))
      .returning();

    // Get company name for timeline
    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, application.companyId));

    await logTimeline({
      eventType: 'application_status_changed',
      title: `${company?.name || 'Unknown'}: ${oldStatus.replace('_', ' ')} -> ${newStatus.replace('_', ' ')}`,
      applicationId: id,
      companyId: application.companyId,
      metadata: { from: oldStatus, to: newStatus }
    });

    return success(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
