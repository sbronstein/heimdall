import { db } from '@/lib/db';
import { interactions } from '../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import { interactionTypeValues, interactionSentimentValues } from '@/lib/domain/types';

const updateInteractionSchema = z.object({
  type: z.enum(interactionTypeValues).optional(),
  direction: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  sentiment: z.enum(interactionSentimentValues).optional().nullable(),
  durationMinutes: z.number().int().optional().nullable(),
  followUpRequired: z.boolean().optional(),
  followUpDate: z.string().datetime().optional().nullable(),
  followUpCompleted: z.boolean().optional(),
  tags: z.array(z.string()).optional().nullable()
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [interaction] = await db.select().from(interactions).where(eq(interactions.id, id));
    if (!interaction) return notFound('Interaction');
    return success(interaction);
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
    const validated = updateInteractionSchema.parse(body);

    const values: Record<string, unknown> = { ...validated, updatedAt: new Date() };
    if (validated.followUpDate) values.followUpDate = new Date(validated.followUpDate);

    const [interaction] = await db
      .update(interactions)
      .set(values)
      .where(eq(interactions.id, id))
      .returning();

    if (!interaction) return notFound('Interaction');

    await logTimeline({
      eventType: 'interaction_updated',
      title: `Updated interaction: ${interaction.subject || interaction.type}`,
      interactionId: interaction.id,
      contactId: interaction.contactId || undefined,
      companyId: interaction.companyId || undefined
    });

    return success(interaction);
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [interaction] = await db
      .delete(interactions)
      .where(eq(interactions.id, id))
      .returning();

    if (!interaction) return notFound('Interaction');
    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}
