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
import { outreachEmailStatusValues } from '@/lib/domain/types';
import { z } from 'zod';

const statusChangeSchema = z.object({
  status: z.enum(outreachEmailStatusValues),
  lastError: z.string().max(500).nullable().optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  try {
    const { id, emailId } = await params;
    const body = await request.json();
    const validated = statusChangeSchema.parse(body);
    const newStatus = validated.status;

    // CD-06: verify email belongs to campaign
    const [email] = await db
      .select()
      .from(outreachEmails)
      .where(
        and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id))
      )
      .limit(1);

    if (!email) return notFound('Email');

    // State machine guard — canEmailTransition from email-status.ts
    if (!canEmailTransition(email.status, newStatus)) {
      return validationError(
        `Invalid transition: ${email.status} -> ${newStatus}`
      );
    }

    // CD-03: guard → approved only when content exists
    if (newStatus === 'approved') {
      const subject = email.editedSubject ?? email.generatedSubject;
      const emailBody = email.editedBody ?? email.generatedBody;
      if (!subject || !emailBody) {
        return validationError('Cannot approve: email has no content');
      }

      // REV-06: defense-in-depth — reject approve if contact is archived
      const [contact] = await db
        .select({ archivedAt: contacts.archivedAt })
        .from(contacts)
        .where(eq(contacts.id, email.contactId))
        .limit(1);

      if (contact?.archivedAt != null) {
        return validationError('Cannot approve: contact is archived');
      }
    }

    // Build update — D-05 reset semantics when transitioning → pending
    const update: Record<string, unknown> = {
      status: newStatus,
      updatedAt: new Date()
    };

    if (newStatus === 'pending') {
      // D-05: clear edited* + error fields + generatedAt; keep generated* (shown greyed-out)
      update.editedSubject = null;
      update.editedBody = null;
      update.lastError = null;
      update.lastErrorAt = null;
      update.generatedAt = null;
      // generatedSubject / generatedBody intentionally NOT cleared
    } else if (newStatus === 'failed') {
      update.lastError = validated.lastError ?? null;
      update.lastErrorAt = new Date();
    } else if (newStatus === 'approved') {
      update.approvedAt = new Date();
    }

    const [updated] = await db
      .update(outreachEmails)
      .set(update)
      .where(
        and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id))
      )
      .returning();

    await logTimeline({
      eventType: 'outreach_email_status_changed',
      title: `Email: ${email.status} -> ${newStatus}`,
      metadata: { campaignId: id, emailId, from: email.status, to: newStatus }
    });

    return success(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
