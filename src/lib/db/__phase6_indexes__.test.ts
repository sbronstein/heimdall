import { createTestDb } from '@/test-utils/pglite';
import { sql } from 'drizzle-orm';

describe('Phase 6 schema indexes regression (D-20)', () => {
  it('migrations create the 5 hot-path indexes from D-13', async () => {
    const db = await createTestDb();
    const result = await db.execute(sql`
      SELECT indexname, tablename, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('contacts', 'companies')
    `);
    const rows = result.rows as Array<{ indexname: string; tablename: string; indexdef: string }>;
    const indexNames = rows.map((r) => r.indexname);
    expect(indexNames).toEqual(expect.arrayContaining([
      'contacts_archived_at_idx',
      'contacts_linkedin_url_unique_idx',
      'contacts_company_id_idx',
      'contacts_linkedin_connection_date_idx',
      'companies_name_idx'
    ]));
  });

  it('contacts_linkedin_url_unique_idx is a partial UNIQUE scoped to ACTIVE rows only (D-08 + Out-of-scope invariant)', async () => {
    const db = await createTestDb();
    const result = await db.execute(sql`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'contacts'
        AND indexname = 'contacts_linkedin_url_unique_idx'
    `);
    const rows = result.rows as Array<{ indexdef: string }>;
    expect(rows).toHaveLength(1);
    const def = rows[0].indexdef.toUpperCase();
    // Pins the UNIQUE constraint.
    expect(def).toContain('UNIQUE');
    // Pins the partial predicate exists.
    expect(def).toContain('WHERE');
    // Pins BOTH halves of the conjunctive predicate. The `AND archived_at IS NULL` half
    // is the CONTEXT §Out-of-scope invariant — "the existing behavior (dedup only against
    // active contacts, allowing re-import of archived ones) is the documented intent."
    // Without this clause, re-importing a previously-archived linkedin_url silently
    // no-ops via ON CONFLICT DO NOTHING in Plan 4 — a behavioral regression.
    expect(def).toContain('LINKEDIN_URL IS NOT NULL');
    expect(def).toContain('ARCHIVED_AT IS NULL');
  });
});
