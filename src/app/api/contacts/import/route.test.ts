import { readFile } from 'node:fs/promises';
import { createTestDb } from '@/test-utils/pglite';
import { callRoute } from '@/test-utils/call-route';
import { contacts, timelineEvents } from '../../../../../drizzle/schema';
import { eq, sql } from 'drizzle-orm';

// vi.hoisted + Proxy pattern — mandated by D-05/D-07/02-03-PLAN
const { dbRef } = vi.hoisted(() => ({ dbRef: { current: null as Awaited<ReturnType<typeof createTestDb>> | null } }));

vi.mock('@/lib/db', () => ({
  db: new Proxy({}, { get: (_: object, prop: string | symbol) => (dbRef.current as unknown as Record<string | symbol, unknown>)[prop] })
}));

describe('POST /api/contacts/import', () => {
  beforeEach(async () => {
    dbRef.current = await createTestDb();
    // contacts and timeline_events start empty per test
  });

  it('happy path: fixture CSV with preamble + 3 valid rows + 1 malformed row imports 3 contacts and writes timeline row', async () => {
    const { POST } = await import('@/app/api/contacts/import/route');

    const csvBuffer = await readFile(new URL('./__fixtures__/linkedin-connections.csv', import.meta.url));
    const file = new File([csvBuffer], 'linkedin-connections.csv', { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', file);

    const { status, body } = await callRoute(POST, { method: 'POST', formData });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        created: 3,
        skipped: 0,
        errors: expect.arrayContaining([expect.stringContaining('missing name')])
      }
    });
    const bodyData = (body as { success: boolean; data: { created: number; skipped: number; errors: string[] } }).data;
    expect(bodyData.errors).toHaveLength(1);

    // 3 contacts rows in PGlite
    const contactRows = await dbRef.current!.select().from(contacts);
    expect(contactRows).toHaveLength(3);

    // All contacts should have importSource linkedin_csv and linkedin-import tag
    for (const row of contactRows) {
      expect(row.importSource).toBe('linkedin_csv');
      expect(row.tags).toContain('linkedin-import');
      expect(row.closeness).toBe('acquaintance');
    }

    // Timeline side-effect: exactly 1 row with contacts_imported eventType
    const tlRows = await dbRef.current!.select().from(timelineEvents);
    expect(tlRows).toHaveLength(1);
    expect(tlRows[0].eventType).toBe('contacts_imported');
    expect(tlRows[0].title).toMatch(/^Imported 3 contacts/);
    const meta = tlRows[0].metadata as Record<string, unknown>;
    expect(meta.created).toBe(3);
    expect(meta.errors).toBe(1);
  });

  it('missing file: returns 400 with CSV file is required error and writes no rows', async () => {
    const { POST } = await import('@/app/api/contacts/import/route');

    const formData = new FormData();
    // No 'file' entry — triggers the missing-file guard
    const { status, body } = await callRoute(POST, { method: 'POST', formData });

    expect(status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: 'CSV file is required'
    });

    // No rows written to either table
    const contactRows = await dbRef.current!.select().from(contacts);
    expect(contactRows).toHaveLength(0);
    const tlRows = await dbRef.current!.select().from(timelineEvents);
    expect(tlRows).toHaveLength(0);
  });

  it('dedup within import: two rows with same LinkedIn URL result in created: 1, skipped: 1', async () => {
    const { POST } = await import('@/app/api/contacts/import/route');

    const csvContent = [
      'First Name,Last Name,Email Address,Company,Position,Connected On,URL',
      'Eve,Evans,eve@example.com,Echo Corp,Engineer,01 Jan 2024,https://linkedin.com/in/eve-evans',
      'Eve,Evans,eve2@example.com,Echo Corp,Engineer,01 Jan 2024,https://linkedin.com/in/eve-evans'
    ].join('\n');

    const file = new File([csvContent], 'dedup-test.csv', { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', file);

    const { status, body } = await callRoute(POST, { method: 'POST', formData });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        created: 1,
        skipped: 1
      }
    });

    const contactRows = await dbRef.current!.select().from(contacts);
    expect(contactRows).toHaveLength(1);
  });

  it('URL dedup against pre-existing active contact: returns created: 0, skipped: 1, NO timeline event', async () => {
    await dbRef.current!.insert(contacts).values({
      firstName: 'Eve',
      lastName: 'Existing',
      linkedinUrl: 'https://linkedin.com/in/eve-existing'
    });

    const csv = [
      'First Name,Last Name,Email Address,Company,Position,Connected On,URL',
      'Eve,Existing,eve@new.com,NewCorp,Engineer,01 Jan 2024,https://linkedin.com/in/eve-existing'
    ].join('\n');
    const file = new File([csv], 'eve.csv', { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', file);

    const { POST } = await import('@/app/api/contacts/import/route');
    const { status, body } = await callRoute(POST, { method: 'POST', formData });

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { created: 0, skipped: 1 } });

    const contactRows = await dbRef.current!.select().from(contacts);
    expect(contactRows).toHaveLength(1);  // The pre-existing Eve only; no second Eve.

    // Timeline event was NOT emitted (created === 0 short-circuited the guard).
    const tlRows = await dbRef.current!.select().from(timelineEvents);
    expect(tlRows).toHaveLength(0);
  });

  it('Name+company dedup against pre-existing contact (no URL): returns created: 0, skipped: 1', async () => {
    await dbRef.current!.insert(contacts).values({
      firstName: 'Frank',
      lastName: 'Foster',
      currentCompany: 'FooCorp'
    });

    const csv = [
      'First Name,Last Name,Email Address,Company,Position,Connected On,URL',
      'Frank,Foster,frank@new.com,FooCorp,Engineer,01 Jan 2024,'  // empty URL
    ].join('\n');
    const file = new File([csv], 'frank.csv', { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', file);

    const { POST } = await import('@/app/api/contacts/import/route');
    const { status, body } = await callRoute(POST, { method: 'POST', formData });

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { created: 0, skipped: 1 } });

    const contactRows = await dbRef.current!.select().from(contacts);
    expect(contactRows).toHaveLength(1);
  });

  it('Header-only CSV: returns created: 0, skipped: 0, no rows inserted, no timeline', async () => {
    const csv = 'First Name,Last Name,Email Address,Company,Position,Connected On,URL';
    const file = new File([csv], 'empty.csv', { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', file);

    const { POST } = await import('@/app/api/contacts/import/route');
    const { status, body } = await callRoute(POST, { method: 'POST', formData });

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { created: 0, skipped: 0, errors: [] } });

    const contactRows = await dbRef.current!.select().from(contacts);
    expect(contactRows).toHaveLength(0);
    const tlRows = await dbRef.current!.select().from(timelineEvents);
    expect(tlRows).toHaveLength(0);
  });

  it('Test 8a: URL-only dedup branch — 3 rows with same URL, distinct names', async () => {
    // Note: even though we re-POST the same CSV, this test specifically exercises
    // the URL dedup branch by ensuring NAMES differ from anything pre-existing,
    // so the name+company branch returns 0 matches and only the URL ON CONFLICT
    // path fires.
    const csv = [
      'First Name,Last Name,Email Address,Company,Position,Connected On,URL',
      'Alpha,One,a@x.com,AcmeA,Eng,01 Jan 2024,https://linkedin.com/in/dup',
      'Beta,Two,b@x.com,AcmeB,Eng,02 Jan 2024,https://linkedin.com/in/dup',
      'Gamma,Three,c@x.com,AcmeC,Eng,03 Jan 2024,https://linkedin.com/in/dup'
    ].join('\n');

    const post = async () => {
      const file = new File([csv], 'dup.csv', { type: 'text/csv' });
      const formData = new FormData();
      formData.append('file', file);
      const { POST } = await import('@/app/api/contacts/import/route');
      return callRoute<{ data: { created: number; skipped: number } }>(POST, { method: 'POST', formData });
    };

    // Capture pre-call idx_scan count for the partial UNIQUE index.
    // PGlite supports pg_stat_user_indexes; query for the baseline.
    const idxScanBefore = await dbRef.current!.execute(sql`
      SELECT idx_scan FROM pg_stat_user_indexes WHERE indexrelname = 'contacts_linkedin_url_unique_idx'
    `);
    const scanBefore = (idxScanBefore.rows[0] as { idx_scan: number } | undefined)?.idx_scan ?? 0;

    const first = await post();
    // First POST: internal duplicate within the bulk insert → 1 created, 2 skipped
    // (the ON CONFLICT fires twice within the single VALUES batch).
    expect(first.body).toMatchObject({ data: { created: 1, skipped: 2 } });

    const second = await post();
    // Second POST: all 3 rows conflict with the existing active row from first POST.
    // The name+company branch returns 0 matches (names differ from the seeded row).
    // → all 3 deduped via URL ON CONFLICT.
    expect(second.body).toMatchObject({ data: { created: 0, skipped: 3 } });

    const idxScanAfter = await dbRef.current!.execute(sql`
      SELECT idx_scan FROM pg_stat_user_indexes WHERE indexrelname = 'contacts_linkedin_url_unique_idx'
    `);
    const scanAfter = (idxScanAfter.rows[0] as { idx_scan: number } | undefined)?.idx_scan ?? 0;
    // Index was scanned for the ON CONFLICT check.
    expect(scanAfter).toBeGreaterThan(scanBefore);

    const contactRows = await dbRef.current!.select().from(contacts);
    expect(contactRows).toHaveLength(1);
  });

  it('Test 8b: name+company-only dedup branch — 3 rows with null URL, matching name+company', async () => {
    // Seed 3 active contacts with name+company tuples; no URLs.
    await dbRef.current!.insert(contacts).values([
      { firstName: 'Nico', lastName: 'NameOnly', currentCompany: 'NCo' },
      { firstName: 'Olga', lastName: 'OnlyName', currentCompany: 'OCo' },
      { firstName: 'Pat', lastName: 'PureName', currentCompany: 'PCo' }
    ]);

    const csv = [
      'First Name,Last Name,Email Address,Company,Position,Connected On,URL',
      'Nico,NameOnly,n@x.com,NCo,Eng,01 Jan 2024,',  // empty URL
      'Olga,OnlyName,o@x.com,OCo,Eng,02 Jan 2024,',  // empty URL
      'Pat,PureName,p@x.com,PCo,Eng,03 Jan 2024,'    // empty URL
    ].join('\n');
    const file = new File([csv], 'names.csv', { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', file);

    const { POST } = await import('@/app/api/contacts/import/route');
    const { status, body } = await callRoute(POST, { method: 'POST', formData });

    expect(status).toBe(200);
    // All 3 deduped via narrowed name+company SELECT; URL branch returned 0 (no URLs).
    expect(body).toMatchObject({ data: { created: 0, skipped: 3 } });

    const contactRows = await dbRef.current!.select().from(contacts);
    expect(contactRows).toHaveLength(3);  // Original seeds only.
  });

  it('Test 8c: re-importing an archived linkedin_url creates a fresh active row', async () => {
    // Seed an ARCHIVED contact with a specific URL.
    await dbRef.current!.insert(contacts).values({
      firstName: 'Archived',
      lastName: 'User',
      linkedinUrl: 'https://linkedin.com/in/archived-user',
      archivedAt: new Date()
    });

    const csv = [
      'First Name,Last Name,Email Address,Company,Position,Connected On,URL',
      'Rebuilt,User,r@x.com,RebuiltCo,Eng,01 Jan 2024,https://linkedin.com/in/archived-user'
    ].join('\n');
    const file = new File([csv], 'archived.csv', { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', file);

    const { POST } = await import('@/app/api/contacts/import/route');
    const { status, body } = await callRoute(POST, { method: 'POST', formData });

    expect(status).toBe(200);
    // The partial UNIQUE predicate (`WHERE linkedin_url IS NOT NULL AND archived_at IS NULL`)
    // means the archived row is NOT in the index → no conflict → fresh row created.
    expect(body).toEqual({ success: true, data: { created: 1, skipped: 0, errors: [] } });

    // Two rows now share the same linkedin_url: one archived, one freshly active.
    const sameUrlRows = await dbRef.current!
      .select()
      .from(contacts)
      .where(eq(contacts.linkedinUrl, 'https://linkedin.com/in/archived-user'));
    expect(sameUrlRows).toHaveLength(2);

    const active = sameUrlRows.find((r) => r.archivedAt === null);
    const archived = sameUrlRows.find((r) => r.archivedAt !== null);
    expect(active).toBeDefined();
    expect(archived).toBeDefined();
    expect(active!.firstName).toBe('Rebuilt');
    expect(archived!.firstName).toBe('Archived');
  });
});
