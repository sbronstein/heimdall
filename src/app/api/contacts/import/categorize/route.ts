import { db } from '@/lib/db';
import { contacts } from '../../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { serverError, validationError } from '@/lib/api/errors';
import { z } from 'zod';
import { contactClosenessValues } from '@/lib/domain/types';

const bulkCategorizeSchema = z.object({
  updates: z.array(
    z.object({
      contactId: z.string().uuid(),
      closeness: z.enum(contactClosenessValues)
    })
  )
});

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { updates } = bulkCategorizeSchema.parse(body);

    let updated = 0;
    for (const { contactId, closeness } of updates) {
      const [result] = await db
        .update(contacts)
        .set({ closeness, updatedAt: new Date() })
        .where(eq(contacts.id, contactId))
        .returning();
      if (result) updated++;
    }

    return success({ updated, total: updates.length });
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}
