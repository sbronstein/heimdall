import { readFile } from 'node:fs/promises';
import { createTestDb } from '@/test-utils/pglite';
import { callRoute } from '@/test-utils/call-route';
import { contacts, timelineEvents } from '../../../../../drizzle/schema';

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
});
