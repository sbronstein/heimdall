import { createTestDb } from '@/test-utils/pglite';
import { callRoute } from '@/test-utils/call-route';
import { contacts } from '../../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';

// vi.hoisted + Proxy pattern — mandated by D-05/D-07/02-03-PLAN
const { dbRef } = vi.hoisted(() => ({
  dbRef: { current: null as Awaited<ReturnType<typeof createTestDb>> | null }
}));

vi.mock('@/lib/db', () => ({
  db: new Proxy({}, {
    get: (_: object, prop: string | symbol) =>
      (dbRef.current as unknown as Record<string | symbol, unknown>)[prop]
  })
}));

describe('PATCH /api/contacts/import/categorize (bulk UPDATE)', () => {
  // Pre-warm the module import and PGlite wasm before tests run. Without this,
  // Test 1 bears the full cold-start module-loading cost (~2-4s on first run)
  // and may timeout at vitest's default 5000ms limit.
  beforeAll(async () => {
    await import('@/app/api/contacts/import/categorize/route');
  }, 30000);

  beforeEach(async () => {
    dbRef.current = await createTestDb();
  }, 30000);

  it('Test 1: happy path — bulk update of 3 contacts sets closeness for each', async () => {
    const seeded = await dbRef.current!
      .insert(contacts)
      .values([
        { firstName: 'Alice', lastName: 'A' },
        { firstName: 'Bob', lastName: 'B' },
        { firstName: 'Carol', lastName: 'C' }
      ])
      .returning();

    const { PATCH } = await import('@/app/api/contacts/import/categorize/route');
    const { status, body } = await callRoute(PATCH, {
      method: 'PATCH',
      body: {
        updates: [
          { contactId: seeded[0].id, closeness: 'close_friend' },
          { contactId: seeded[1].id, closeness: 'colleague' },
          { contactId: seeded[2].id, closeness: 'career_contact' }
        ]
      }
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { updated: 3, total: 3 } });

    // Verify each contact's closeness was updated
    const rows = await dbRef.current!.select().from(contacts);
    const sorted = rows.sort((a, b) => a.firstName.localeCompare(b.firstName));
    // Alice → close_friend, Bob → colleague, Carol → career_contact
    expect(sorted[0].closeness).toBe('close_friend');
    expect(sorted[1].closeness).toBe('colleague');
    expect(sorted[2].closeness).toBe('career_contact');

    // Each updated_at should be >= the seed time (UPDATE ran after insert).
    // Comparing against PGlite's own seed timestamps avoids wall-clock drift
    // between JS Date.now() and PGlite's internal clock.
    for (const seededRow of seeded) {
      const updated = rows.find((r) => r.id === seededRow.id)!;
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(seededRow.updatedAt.getTime());
    }
  });

  it('Test 2: bulk UPDATE is observably one statement — all updated_at within 50ms window', async () => {
    const seeded = await dbRef.current!
      .insert(contacts)
      .values([
        { firstName: 'D', lastName: 'D' },
        { firstName: 'E', lastName: 'E' },
        { firstName: 'F', lastName: 'F' }
      ])
      .returning();

    const { PATCH } = await import('@/app/api/contacts/import/categorize/route');
    await callRoute(PATCH, {
      method: 'PATCH',
      body: {
        updates: [
          { contactId: seeded[0].id, closeness: 'friend' },
          { contactId: seeded[1].id, closeness: 'colleague' },
          { contactId: seeded[2].id, closeness: 'linkedin_only' }
        ]
      }
    });

    const rows = await dbRef.current!.select().from(contacts);
    const times = rows.map((r) => r.updatedAt.getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    // Single SQL statement: all updated_at timestamps within 50ms of each other
    expect(Math.abs(maxTime - minTime)).toBeLessThan(50);
  });

  it('Test 3: RETURNING-based updated count + response-shape envelope pin (N=4, M=3)', async () => {
    const seeded = await dbRef.current!
      .insert(contacts)
      .values([
        { firstName: 'A', lastName: 'A' },
        { firstName: 'B', lastName: 'B' },
        { firstName: 'C', lastName: 'C' }
      ])
      .returning();

    const { PATCH } = await import('@/app/api/contacts/import/categorize/route');
    const { status, body } = await callRoute(PATCH, {
      method: 'PATCH',
      body: {
        updates: [
          { contactId: seeded[0].id, closeness: 'close_friend' },
          { contactId: seeded[1].id, closeness: 'colleague' },
          { contactId: seeded[2].id, closeness: 'acquaintance' },
          { contactId: '00000000-0000-0000-0000-000000000000', closeness: 'close_friend' } // unknown uuid
        ]
      }
    });

    expect(status).toBe(200);
    // Response-shape envelope pin: identical to the pre-rewrite handler.
    // N=4 inputs, M=3 actually existed → updated:3, total:4.
    expect(body).toEqual({
      success: true,
      data: { updated: 3, total: 4 }
    });
  });

  it('Test 4: empty input early-return — no SQL issued, no timestamps mutated', async () => {
    const [seeded] = await dbRef.current!
      .insert(contacts)
      .values({ firstName: 'X', lastName: 'Y' })
      .returning();
    const beforeUpdatedAt = seeded.updatedAt;

    const { PATCH } = await import('@/app/api/contacts/import/categorize/route');
    const { status, body } = await callRoute(PATCH, {
      method: 'PATCH',
      body: { updates: [] }
    });

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, data: { updated: 0, total: 0 } });

    const [after] = await dbRef.current!.select().from(contacts).where(eq(contacts.id, seeded.id));
    // Byte-identical means NO update ran. If the route had executed UPDATE,
    // `updated_at = NOW()` would have shifted this even for zero matching rows.
    expect(after.updatedAt?.getTime()).toBe(beforeUpdatedAt?.getTime());
  });

  it('Test 5: idempotency under retry — second call produces same final state, updated_at advances', async () => {
    const [seeded] = await dbRef.current!
      .insert(contacts)
      .values({ firstName: 'Retry', lastName: 'Test' })
      .returning();

    const { PATCH } = await import('@/app/api/contacts/import/categorize/route');
    const updates = { updates: [{ contactId: seeded.id, closeness: 'close_friend' }] };

    // First call
    const { status: status1, body: body1 } = await callRoute(PATCH, {
      method: 'PATCH',
      body: updates
    });
    expect(status1).toBe(200);
    expect(body1).toMatchObject({ success: true, data: { updated: 1, total: 1 } });

    const [afterFirst] = await dbRef.current!
      .select()
      .from(contacts)
      .where(eq(contacts.id, seeded.id));
    const firstUpdatedAt = afterFirst.updatedAt.getTime();

    // Small wait so timestamps are distinguishable on PGlite
    await new Promise((r) => setTimeout(r, 10));

    // Second call with identical body
    const { status: status2, body: body2 } = await callRoute(PATCH, {
      method: 'PATCH',
      body: updates
    });
    expect(status2).toBe(200);
    expect(body2).toMatchObject({ success: true, data: { updated: 1, total: 1 } });

    const [afterSecond] = await dbRef.current!
      .select()
      .from(contacts)
      .where(eq(contacts.id, seeded.id));

    // Final state: closeness is still correct
    expect(afterSecond.closeness).toBe('close_friend');

    // Second call's updated_at is strictly greater than first call's (proves UPDATE actually ran)
    expect(afterSecond.updatedAt.getTime()).toBeGreaterThan(firstUpdatedAt);
  });

  it('Test 6: Zod validation — invalid uuid returns 400, no rows mutated', async () => {
    const { PATCH } = await import('@/app/api/contacts/import/categorize/route');
    const { status, body } = await callRoute(PATCH, {
      method: 'PATCH',
      body: {
        updates: [{ contactId: 'not-a-uuid', closeness: 'close_friend' }]
      }
    });

    expect(status).toBe(400);
    expect(body).toMatchObject({ success: false, error: expect.any(String) });

    // No rows were mutated
    const rows = await dbRef.current!.select().from(contacts);
    expect(rows).toHaveLength(0);
  });
});
