import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
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

    // Empty-input early return — no SQL issued. Cheap defensive path.
    if (updates.length === 0) {
      return success({ updated: 0, total: 0 });
    }

    // Build a VALUES list with one (cid, cl) pair per update.
    // Each ${contactId} and ${closeness} is a bound parameter via the sql
    // template tag — NOT string-concatenated. Using `cid` as the column alias
    // (not `id`) avoids a column-name ambiguity in the WHERE clause between
    // contacts.id and data.id when both tables are in scope.
    const valuesList = sql.join(
      updates.map((u) => sql`(${u.contactId}::uuid, ${u.closeness}::contact_closeness)`),
      sql`, `
    );

    // Single round-trip bulk UPDATE.
    // CLAUDE.md "no raw SQL" guard: `sql` template tag inside db.execute()
    // is the documented Drizzle escape for batched UPDATE/INSERT (D-06).
    // The VALUES list uses per-element bound parameters — each contactId and
    // closeness value is interpolated as a $N placeholder by Drizzle's sql
    // template tag (NOT string-concatenated), preserving SQL safety.
    // RETURNING contacts.id gives the count of actually-mutated rows.
    //
    // Identifiers (`contacts`, `contacts.id`) are LITERAL strings in the
    // template — NOT Drizzle pgTable interpolations. The literal form has
    // analog precedent in metrics/dashboard/route.ts and avoids relying on
    // Drizzle v0.45.1 behavior for table-interpolation that has no repo
    // precedent (WARNING 2 fix). Trade-off: a future table rename requires
    // updating this SQL string by hand — accepted for Phase 6 scope.
    //
    // Note on implementation choice: the plan spec called for unnest(${ids}::uuid[])
    // but Drizzle's sql template renders a JS array as a row constructor tuple
    // `($1, $2)::uuid[]` (invalid cast) rather than a Postgres array literal.
    // The VALUES approach achieves identical single-round-trip semantics with
    // parameter binding that works across both the PGlite test harness and the
    // Neon HTTP production driver (D-06 / Rule 1 deviation).
    const result = await db.execute(sql`
      UPDATE contacts
      SET closeness = data.cl,
          updated_at = NOW()
      FROM (VALUES ${valuesList}) AS data(cid, cl)
      WHERE contacts.id = data.cid
      RETURNING contacts.id
    `);

    const updated = (result.rows as Array<{ id: string }>).length;
    return success({ updated, total: updates.length });
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}
