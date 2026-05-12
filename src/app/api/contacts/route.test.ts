import { createTestDb } from '@/test-utils/pglite';
import { callRoute } from '@/test-utils/call-route';
import { contacts } from '../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import type { Contact, NewContact } from '@/lib/domain/types';

// vi.hoisted + Proxy pattern — mandated by D-05/D-07/02-03-PLAN
const { dbRef } = vi.hoisted(() => ({ dbRef: { current: null as Awaited<ReturnType<typeof createTestDb>> | null } }));

vi.mock('@/lib/db', () => ({
  db: new Proxy({}, { get: (_: object, prop: string | symbol) => (dbRef.current as unknown as Record<string | symbol, unknown>)[prop] })
}));

// Helper: insert a contact with explicit updatedAt for deterministic cursor ordering
async function seedContact(overrides: Partial<NewContact> = {}): Promise<Contact> {
  const [contact] = await dbRef.current!
    .insert(contacts)
    .values({
      firstName: 'Test',
      lastName: `Contact-${crypto.randomUUID().slice(0, 8)}`,
      ...overrides
    })
    .returning();
  return contact as Contact;
}

describe('GET /api/contacts pagination envelope + soft-delete filter', () => {
  beforeEach(async () => {
    dbRef.current = await createTestDb();
    // Each it() performs its own targeted seed
  });

  it('returns paginated envelope with cursor = oldest visible updatedAt', async () => {
    const { GET } = await import('@/app/api/contacts/route');

    // Seed 3 contacts with explicit updatedAt values — newest first when ordered desc
    const oldest = await seedContact({ updatedAt: new Date('2026-01-01T00:00:00.000Z') });
    const middle = await seedContact({ updatedAt: new Date('2026-01-02T00:00:00.000Z') });
    const newest = await seedContact({ updatedAt: new Date('2026-01-03T00:00:00.000Z') });

    const { status, body } = await callRoute(GET, { method: 'GET' });

    expect(status).toBe(200);
    const b = body as { success: boolean; data: Array<Record<string, unknown>>; meta: { cursor: string | null; hasMore: boolean } };
    expect(b.success).toBe(true);
    expect(Array.isArray(b.data)).toBe(true);
    expect(b.data).toHaveLength(3);

    // Data is ordered newest-first (desc updatedAt)
    expect(b.data[0].id).toBe(newest.id);
    expect(b.data[1].id).toBe(middle.id);
    expect(b.data[2].id).toBe(oldest.id);

    // meta.cursor = oldest visible contact's updatedAt.toISOString()
    expect(b.meta.cursor).toBe('2026-01-01T00:00:00.000Z');
    expect(b.meta.hasMore).toBe(false);
  });

  it('returns hasMore: true and correct cursor when limit is less than total contacts', async () => {
    const { GET } = await import('@/app/api/contacts/route');

    // Seed 3 contacts with distinct timestamps
    await seedContact({ updatedAt: new Date('2026-01-01T00:00:00.000Z') });
    const middle = await seedContact({ updatedAt: new Date('2026-01-02T00:00:00.000Z') });
    await seedContact({ updatedAt: new Date('2026-01-03T00:00:00.000Z') });

    // Limit to 2 — newest 2 returned, oldest excluded, hasMore = true
    const { status, body } = await callRoute(GET, { method: 'GET', searchParams: { limit: '2' } });

    expect(status).toBe(200);
    const b = body as { success: boolean; data: Array<Record<string, unknown>>; meta: { cursor: string | null; hasMore: boolean } };
    expect(b.success).toBe(true);
    expect(b.data).toHaveLength(2);
    expect(b.meta.hasMore).toBe(true);

    // Cursor = oldest of the 2 returned items (middle contact = 01-02)
    expect(b.meta.cursor).toBe('2026-01-02T00:00:00.000Z');
    // The middle contact is b.data[1] since newest is b.data[0]
    expect(b.data[1].id).toBe(middle.id);
  });

  it('returns empty envelope when contacts table is empty', async () => {
    const { GET } = await import('@/app/api/contacts/route');

    // No seed — PGlite freshly migrated, contacts table empty
    const { status, body } = await callRoute(GET, { method: 'GET' });

    expect(status).toBe(200);
    const b = body as { success: boolean; data: unknown[]; meta: { cursor: string | null; hasMore: boolean } };
    expect(b.success).toBe(true);
    expect(b.data).toEqual([]);
    expect(b.meta.cursor).toBeNull();
    expect(b.meta.hasMore).toBe(false);
  });

  it('excludes soft-deleted contacts (archivedAt != null) from results', async () => {
    const { GET } = await import('@/app/api/contacts/route');

    // Seed 3 contacts
    const oldest = await seedContact({ updatedAt: new Date('2026-01-01T00:00:00.000Z') });
    const toArchive = await seedContact({ updatedAt: new Date('2026-01-02T00:00:00.000Z') });
    await seedContact({ updatedAt: new Date('2026-01-03T00:00:00.000Z') });

    // Soft-delete the middle contact
    await dbRef.current!
      .update(contacts)
      .set({ archivedAt: new Date() })
      .where(eq(contacts.id, toArchive.id));

    const { status, body } = await callRoute(GET, { method: 'GET' });

    expect(status).toBe(200);
    const b = body as { success: boolean; data: Array<Record<string, unknown>>; meta: { cursor: string | null; hasMore: boolean } };
    expect(b.success).toBe(true);
    // Only 2 non-archived contacts returned
    expect(b.data).toHaveLength(2);

    // Archived contact must NOT appear in results
    const returnedIds = b.data.map((c) => c.id);
    expect(returnedIds).not.toContain(toArchive.id);

    // Cursor = oldest REMAINING (non-archived) contact = oldest (01-01)
    expect(b.meta.cursor).toBe('2026-01-01T00:00:00.000Z');
    expect(b.meta.hasMore).toBe(false);
  });
});
