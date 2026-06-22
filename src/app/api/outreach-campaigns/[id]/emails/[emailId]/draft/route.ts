import { db } from '@/lib/db';
import {
  outreachEmails,
  contacts
} from '../../../../../../../../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { canEmailTransition } from '@/features/outreach/lib/email-status';
import { z } from 'zod';

const draftWriteBackSchema = z.object({
  gmailDraftId: z.string().min(1)
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  try {
    const { id, emailId } = await params;
    const body = await request.json();
    const validated = draftWriteBackSchema.parse(body);

    // D-01: Read first to get current status and contactId for transition check
    const [email] = await db
      .select()
      .from(outreachEmails)
      .where(
        and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id))
      )
      .limit(1);

    if (!email) return notFound('Email');

    // D-01: State-machine guard — only approved → drafted is legal
    if (!canEmailTransition(email.status, 'drafted')) {
      return validationError(`Invalid transition: ${email.status} -> drafted`);
    }

    // D-01: Update email — gmailDraftId + status transition + timestamps
    const [updated] = await db
      .update(outreachEmails)
      .set({
        gmailDraftId: validated.gmailDraftId,
        status: 'drafted',
        draftedAt: new Date(),
        updatedAt: new Date()
      })
      .where(
        and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id))
      )
      .returning();

    // D-01 / DRFT-05: Update contact outreachStatus → reached_out
    await db
      .update(contacts)
      .set({ outreachStatus: 'reached_out', updatedAt: new Date() })
      .where(eq(contacts.id, email.contactId));

    // Preserve existing timeline event type; add contactId for contact timeline
    await logTimeline({
      eventType: 'outreach_email_drafted',
      title: 'Gmail draft created',
      contactId: email.contactId,
      metadata: {
        campaignId: id,
        emailId,
        gmailDraftId: validated.gmailDraftId
      }
    });

    return success(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
