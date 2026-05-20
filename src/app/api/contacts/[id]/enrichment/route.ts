import { db } from '@/lib/db';
import { contacts } from '../../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';

// T-10-03: Zod .max(300) caps are the sanitization boundary for untrusted scraped strings.
// Both fields are optional+nullable so the caller can update one without clearing the other.
const enrichmentSchema = z.object({
  companyAtConnection: z.string().max(300).optional().nullable(),
  roleAtConnection: z.string().max(300).optional().nullable()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = enrichmentSchema.parse(body);

    // Fetch existing contact to confirm it exists and to use current field values for merge
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, id))
      .limit(1);

    if (!contact) return notFound('Contact');

    // Merge incoming values: if caller omits a field, preserve the existing value
    const [updated] = await db
      .update(contacts)
      .set({
        companyAtConnection: validated.companyAtConnection ?? contact.companyAtConnection,
        roleAtConnection: validated.roleAtConnection ?? contact.roleAtConnection,
        enrichmentStatus: 'enriched',
        enrichedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(contacts.id, id))
      .returning();

    await logTimeline({
      eventType: 'contact_enriched',
      title: `Enriched ${updated.firstName} ${updated.lastName} (at-connection company/role)`,
      contactId: updated.id,
      companyId: updated.companyId || undefined
    });

    return success(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
