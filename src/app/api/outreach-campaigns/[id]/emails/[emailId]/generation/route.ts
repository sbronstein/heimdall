import { db } from '@/lib/db';
import { outreachEmails } from '../../../../../../../../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { canEmailTransition } from '@/features/outreach/lib/email-status';
import { z } from 'zod';

const generationWriteBackSchema = z.object({
  generatedSubject: z.string().min(1).max(500),
  generatedBody: z.string().min(1)
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  try {
    const { id, emailId } = await params;
    const body = await request.json();
    const validated = generationWriteBackSchema.parse(body);

    // CD-06: verify email belongs to campaign
    const [email] = await db
      .select()
      .from(outreachEmails)
      .where(
        and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id))
      )
      .limit(1);

    if (!email) return notFound('Email');

    // State machine guard — only pending → generated is allowed (T-16-01)
    if (!canEmailTransition(email.status, 'generated')) {
      return validationError(
        `Invalid transition: ${email.status} -> generated`
      );
    }

    // One UPDATE: content + status + timestamps (T-16-03: scoped to campaignId)
    const [updated] = await db
      .update(outreachEmails)
      .set({
        status: 'generated',
        generatedSubject: validated.generatedSubject,
        generatedBody: validated.generatedBody,
        generatedAt: new Date(),
        updatedAt: new Date() // always set manually
      })
      .where(
        and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id))
      )
      .returning();

    // Row confirmed by the SELECT above could be deleted before this UPDATE —
    // guard the empty .returning() so we never respond success with no data.
    if (!updated) return notFound('Email');

    await logTimeline({
      eventType: 'outreach_email_generated',
      title: 'Email content generated',
      metadata: { campaignId: id, emailId }
    });

    return success(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    // Absent/non-JSON request body throws SyntaxError from request.json() —
    // that is a client error (400), not a server fault (500).
    if (err instanceof SyntaxError) {
      return validationError('Invalid JSON body');
    }
    return serverError(err);
  }
}
