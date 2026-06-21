import { db } from '@/lib/db';
import { outreachEmails } from '../../../../../../../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';

const inlineEditSchema = z.object({
  editedSubject: z.string().max(500).optional().nullable(),
  editedBody: z.string().max(50000).optional().nullable(),
  recipientEmail: z.string().email().optional().nullable()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  try {
    const { id, emailId } = await params;
    const body = await request.json();
    const validated = inlineEditSchema.parse(body);

    // CD-06: verify email belongs to this campaign
    const [existing] = await db
      .select()
      .from(outreachEmails)
      .where(
        and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id))
      )
      .limit(1);

    if (!existing) return notFound('Email');

    // CD-02: auto-transition generated/approved → edited when edit fields are written
    const isEdit =
      validated.editedSubject !== undefined ||
      validated.editedBody !== undefined;
    const shouldTransitionToEdited =
      isEdit &&
      (existing.status === 'generated' || existing.status === 'approved');

    const [email] = await db
      .update(outreachEmails)
      .set({
        ...validated,
        ...(shouldTransitionToEdited ? { status: 'edited' as const } : {}),
        updatedAt: new Date()
      })
      .where(
        and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id))
      )
      .returning();

    await logTimeline({
      eventType: 'outreach_email_edited',
      title: 'Email edited',
      metadata: { campaignId: id, emailId }
    });

    return success(email);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  try {
    const { id, emailId } = await params;

    // CD-04: hard delete (outreach_emails has no archivedAt column)
    const [email] = await db
      .delete(outreachEmails)
      .where(
        and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id))
      )
      .returning();

    if (!email) return notFound('Email');

    await logTimeline({
      eventType: 'outreach_email_deleted',
      title: 'Email deleted',
      metadata: { campaignId: id, emailId }
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}
