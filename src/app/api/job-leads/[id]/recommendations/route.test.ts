import { createTestDb } from '@/test-utils/pglite';
import { callRoute } from '@/test-utils/call-route';
import {
  companies,
  jobLeads,
  prospects,
  prospectBridges,
  contacts,
  timelineEvents
} from '../../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';

const { dbRef } = vi.hoisted(() => ({
  dbRef: { current: null as Awaited<ReturnType<typeof createTestDb>> | null }
}));

vi.mock('@/lib/db', () => ({
  db: new Proxy(
    {},
    {
      get: (_: object, prop: string | symbol) =>
        (dbRef.current as unknown as Record<string | symbol, unknown>)[prop]
    }
  )
}));

describe('GET /api/job-leads/[id]/recommendations (pure read)', () => {
  let leadId: string;
  let bridgePersistedId: string;
  let bridgeNullScoreId: string;

  // Use beforeAll + manual cleanup so the expensive migration replay runs once per suite.
  beforeAll(async () => {
    dbRef.current = await createTestDb();
  }, 30000);

  beforeEach(async () => {
    // Clear all rows in reverse dependency order so FK constraints don't fire.
    await dbRef.current!.delete(prospectBridges);
    await dbRef.current!.delete(timelineEvents);
    await dbRef.current!.delete(prospects);
    await dbRef.current!.delete(jobLeads);
    await dbRef.current!.delete(contacts);
    await dbRef.current!.delete(companies);

    const [company] = await dbRef.current!
      .insert(companies)
      .values({ name: 'AcmeCo' })
      .returning();

    const [lead] = await dbRef.current!
      .insert(jobLeads)
      .values({
        linkedinJobUrl: 'https://www.linkedin.com/jobs/view/9001',
        companyId: company.id,
        companyName: 'AcmeCo',
        roleTitle: 'VP Data',
        status: 'found',
        prospectCount: 2
      })
      .returning();
    leadId = lead.id;

    // BLOCKER 3 fix — seniorityLevel MUST come from seniorityLevelEnum:
    // valid values are 'c_suite', 'vp', 'director', 'senior_manager',
    // 'manager', 'senior_ic', 'ic', 'entry_level', 'unknown'.
    // Use 'c_suite' for the executive-tier prospect (NOT 'executive' which
    // is invalid and would trigger a Postgres enum violation at insert time).
    const [pA, pB] = await dbRef.current!
      .insert(prospects)
      .values([
        { jobLeadId: leadId, name: 'Alice CTO', title: 'CTO', seniorityLevel: 'c_suite' },
        { jobLeadId: leadId, name: 'Bob VP', title: 'VP Engineering', seniorityLevel: 'vp' }
      ])
      .returning();

    const [cX, cY] = await dbRef.current!
      .insert(contacts)
      .values([
        { firstName: 'Carol', lastName: 'Connector', closeness: 'close_friend', lastContactDate: new Date() },
        { firstName: 'Dave', lastName: 'Distant', closeness: 'acquaintance', lastContactDate: null }
      ])
      .returning();

    // One bridge with persisted score, one with null score — covers both branches of `??` in prioritization.ts:55.
    const [bP, bN] = await dbRef.current!
      .insert(prospectBridges)
      .values([
        { prospectId: pA.id, contactId: cX.id, score: 75 },
        { prospectId: pB.id, contactId: cY.id }
      ])
      .returning();
    bridgePersistedId = bP.id;
    bridgeNullScoreId = bN.id;
  }, 20000);

  it('Test 1: returns recommendations for bridges with persisted AND null scores', async () => {
    const { GET } = await import('@/app/api/job-leads/[id]/recommendations/route');
    const { status, body } = await callRoute(
      GET as unknown as Parameters<typeof callRoute>[0],
      { method: 'GET', params: { id: leadId } }
    );
    expect(status).toBe(200);
    const data = (body as { data: { recommendations: unknown[]; meta: { totalBridges: number } } }).data;
    expect(data.meta.totalBridges).toBe(2);
    expect(data.recommendations).toHaveLength(2);
  });

  it('Test 2: no DB writes occur — null-score bridge stays null after GET (Variant B)', async () => {
    const { GET } = await import('@/app/api/job-leads/[id]/recommendations/route');
    await callRoute(
      GET as unknown as Parameters<typeof callRoute>[0],
      { method: 'GET', params: { id: leadId } }
    );

    const [bridge] = await dbRef.current!
      .select()
      .from(prospectBridges)
      .where(eq(prospectBridges.id, bridgeNullScoreId));
    expect(bridge.score).toBeNull();

    const [persistedBridge] = await dbRef.current!
      .select()
      .from(prospectBridges)
      .where(eq(prospectBridges.id, bridgePersistedId));
    expect(persistedBridge.score).toBe(75);
  });

  it('Test 3: no timeline events emitted', async () => {
    const { GET } = await import('@/app/api/job-leads/[id]/recommendations/route');
    await callRoute(
      GET as unknown as Parameters<typeof callRoute>[0],
      { method: 'GET', params: { id: leadId } }
    );
    const events = await dbRef.current!.select().from(timelineEvents);
    expect(events).toHaveLength(0);
  });

  it('Test 4: empty bridges returns empty recommendations array', async () => {
    await dbRef.current!.delete(prospectBridges);

    const { GET } = await import('@/app/api/job-leads/[id]/recommendations/route');
    const { status, body } = await callRoute(
      GET as unknown as Parameters<typeof callRoute>[0],
      { method: 'GET', params: { id: leadId } }
    );

    expect(status).toBe(200);
    const data = (body as { data: { recommendations: unknown[]; meta: { totalBridges: number } } }).data;
    expect(data.recommendations).toHaveLength(0);
    expect(data.meta.totalBridges).toBe(0);
  });

  it('Test 5: idempotent reads — two GETs return identical body and leave DB unchanged', async () => {
    const { GET } = await import('@/app/api/job-leads/[id]/recommendations/route');
    const first = await callRoute(
      GET as unknown as Parameters<typeof callRoute>[0],
      { method: 'GET', params: { id: leadId } }
    );
    const second = await callRoute(
      GET as unknown as Parameters<typeof callRoute>[0],
      { method: 'GET', params: { id: leadId } }
    );
    expect(first.body).toEqual(second.body);

    const bridgesAfter = await dbRef.current!.select().from(prospectBridges);
    expect(bridgesAfter).toHaveLength(2);
    const nullBridge = bridgesAfter.find((b) => b.id === bridgeNullScoreId);
    expect(nullBridge?.score).toBeNull();
  });

  it('Test 6: lead not found returns 404', async () => {
    const { GET } = await import('@/app/api/job-leads/[id]/recommendations/route');
    const { status, body } = await callRoute(
      GET as unknown as Parameters<typeof callRoute>[0],
      { method: 'GET', params: { id: '00000000-0000-0000-0000-000000000000' } }
    );
    expect(status).toBe(404);
    expect(body).toMatchObject({ success: false, error: 'Job lead not found' });
  });
});
