import { db } from '@/lib/db';
import { contacts } from '../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import { contactRelationshipValues, contactWarmthValues } from '@/lib/domain/types';

const updateContactSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable(),
  title: z.string().optional().nullable(),
  currentCompany: z.string().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  relationship: z.enum(contactRelationshipValues).optional(),
  warmth: z.enum(contactWarmthValues).optional(),
  introducedBy: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  howMet: z.string().optional().nullable(),
  lastContactDate: z.union([z.string().date(), z.string().datetime()]).optional().nullable(),
  nextFollowUpDate: z.union([z.string().date(), z.string().datetime()]).optional().nullable(),
  followUpNotes: z.string().optional().nullable()
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    if (!contact) return notFound('Contact');
    return success(contact);
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
    const validated = updateContactSchema.parse(body);

    const values: Record<string, unknown> = { ...validated, updatedAt: new Date() };
    if (validated.lastContactDate) values.lastContactDate = new Date(validated.lastContactDate);
    if (validated.nextFollowUpDate) values.nextFollowUpDate = new Date(validated.nextFollowUpDate);

    const [contact] = await db
      .update(contacts)
      .set(values)
      .where(eq(contacts.id, id))
      .returning();

    if (!contact) return notFound('Contact');

    await logTimeline({
      eventType: 'contact_updated',
      title: `Updated ${contact.firstName} ${contact.lastName}`,
      contactId: contact.id,
      companyId: contact.companyId || undefined
    });

    return success(contact);
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
    const [contact] = await db
      .update(contacts)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning();

    if (!contact) return notFound('Contact');

    await logTimeline({
      eventType: 'contact_archived',
      title: `Archived ${contact.firstName} ${contact.lastName}`,
      contactId: contact.id
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}
