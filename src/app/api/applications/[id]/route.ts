import { db } from '@/lib/db';
import { applications } from '../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import {
  applicationSourceValues,
  excitementLevelValues
} from '@/lib/domain/types';

const updateApplicationSchema = z.object({
  roleTitle: z.string().min(1).max(200).optional(),
  roleLevelConfirmed: z.string().optional().nullable(),
  jobPostingUrl: z.string().url().optional().nullable(),
  jobDescription: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  reportsTo: z.string().optional().nullable(),
  teamSize: z.string().optional().nullable(),
  source: z.enum(applicationSourceValues).optional().nullable(),
  referredBy: z.string().uuid().optional().nullable(),
  excitementLevel: z.enum(excitementLevelValues).optional().nullable(),
  fitScore: z.number().int().min(1).max(10).optional().nullable(),
  fitNotes: z.string().optional().nullable(),
  compensationNotes: z.string().optional().nullable(),
  compensationDetails: z.record(z.string(), z.unknown()).optional().nullable(),
  resumeVersion: z.string().optional().nullable(),
  outcomeNotes: z.string().optional().nullable(),
  rejectionReason: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable()
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, id));

    if (!application) return notFound('Application');
    return success(application);
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
    const validated = updateApplicationSchema.parse(body);

    const [application] = await db
      .update(applications)
      .set({ ...validated, updatedAt: new Date() })
      .where(eq(applications.id, id))
      .returning();

    if (!application) return notFound('Application');

    await logTimeline({
      eventType: 'application_updated',
      title: `Updated application: ${application.roleTitle}`,
      applicationId: application.id,
      companyId: application.companyId
    });

    return success(application);
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
    const [application] = await db
      .update(applications)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(applications.id, id))
      .returning();

    if (!application) return notFound('Application');

    await logTimeline({
      eventType: 'application_archived',
      title: `Archived application: ${application.roleTitle}`,
      applicationId: application.id,
      companyId: application.companyId
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}
