import { db } from '@/lib/db';
import { outreachEmails } from '../../../../../../../../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
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

    const [email] = await db
      .update(outreachEmails)
      .set({
        gmailDraftId: validated.gmailDraftId,
        draftedAt: new Date(),
        updatedAt: new Date()
      })
      .where(
        and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id))
      )
      .returning();

    if (!email) return notFound('Email');

    await logTimeline({
      eventType: 'outreach_email_drafted',
      title: 'Gmail draft created',
      metadata: {
        campaignId: id,
        emailId,
        gmailDraftId: validated.gmailDraftId
      }
    });

    return success(email);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
