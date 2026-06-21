import { db } from '@/lib/db';
import { outreachEmails } from '../../../../../../../../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { outreachChannelValues } from '@/lib/domain/types';
import { z } from 'zod';

const recipientWriteBackSchema = z.object({
  channel: z.enum(outreachChannelValues),
  recipientEmail: z.string().email().optional().nullable()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  try {
    const { id, emailId } = await params;
    const body = await request.json();
    const validated = recipientWriteBackSchema.parse(body);

    // CD-06 + Phase 11 D-08: linkedin_message channel forces recipientEmail = null
    const recipientEmail =
      validated.channel === 'linkedin_message'
        ? null
        : (validated.recipientEmail ?? null);

    const [email] = await db
      .update(outreachEmails)
      .set({
        channel: validated.channel,
        recipientEmail,
        updatedAt: new Date()
      })
      .where(
        and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id))
      )
      .returning();

    if (!email) return notFound('Email');

    await logTimeline({
      eventType: 'outreach_email_recipient_set',
      title: `Email recipient set (channel: ${validated.channel})`,
      metadata: { campaignId: id, emailId, channel: validated.channel }
    });

    return success(email);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
