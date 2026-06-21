import { db } from '@/lib/db';
import { outreachEmails } from '../../../../../../../../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
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

    // CD-06: campaign-scoped update — 404 if email does not belong to this campaign
    const [email] = await db
      .update(outreachEmails)
      .set({
        generatedSubject: validated.generatedSubject,
        generatedBody: validated.generatedBody,
        generatedAt: new Date(),
        updatedAt: new Date() // always set manually
      })
      .where(
        and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id))
      )
      .returning();

    if (!email) return notFound('Email');

    await logTimeline({
      eventType: 'outreach_email_generated',
      title: 'Email content generated',
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
