import { createTestDb } from '@/test-utils/pglite';
import { callRoute } from '@/test-utils/call-route';
import { applications, companies, timelineEvents } from '../../../../../../drizzle/schema';

// vi.hoisted + Proxy pattern — mandated by D-05/D-07/02-03-PLAN
const { dbRef } = vi.hoisted(() => ({ dbRef: { current: null as Awaited<ReturnType<typeof createTestDb>> | null } }));

vi.mock('@/lib/db', () => ({
  db: new Proxy({}, { get: (_: object, prop: string | symbol) => (dbRef.current as Record<string | symbol, unknown>)[prop] })
}));

describe('PATCH /api/applications/[id]/status', () => {
  let appId: string;
  let companyId: string;

  beforeEach(async () => {
    dbRef.current = await createTestDb();

    // Seed a company
    const [company] = await dbRef.current
      .insert(companies)
      .values({ name: 'TestCo' })
      .returning();
    companyId = company.id;

    // Seed an application in 'researching' state
    const [app] = await dbRef.current
      .insert(applications)
      .values({
        companyId,
        roleTitle: 'VP of Data',
        status: 'researching',
        appliedDate: null
      })
      .returning();
    appId = app.id;
  });

  it('valid transition (researching -> applied): returns 200, updates status, sets appliedDate, writes timeline row', async () => {
    const { PATCH } = await import('@/app/api/applications/[id]/status/route');

    const { status, body } = await callRoute(PATCH, {
      method: 'PATCH',
      body: { status: 'applied' },
      params: { id: appId }
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        id: appId,
        status: 'applied'
      })
    });

    // appliedDate should be set after transitioning to 'applied'
    const bodyData = (body as { success: boolean; data: Record<string, unknown> }).data;
    expect(bodyData.appliedDate).not.toBeNull();

    // Timeline side-effect: exactly one row must exist
    const rows = await dbRef.current!.select().from(timelineEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      eventType: 'application_status_changed',
      applicationId: appId,
      companyId
    });
    expect(rows[0].title).toMatch(/TestCo/);
    expect(rows[0].title).toMatch(/researching/);
    expect(rows[0].title).toMatch(/applied/);
    // Metadata fields
    const meta = rows[0].metadata as Record<string, unknown>;
    expect(meta.from).toBe('researching');
    expect(meta.to).toBe('applied');
  });

  it('invalid transition (researching -> offer): returns 400 with transition error, writes NO timeline row', async () => {
    const { PATCH } = await import('@/app/api/applications/[id]/status/route');

    const { status, body } = await callRoute(PATCH, {
      method: 'PATCH',
      body: { status: 'offer' },
      params: { id: appId }
    });

    expect(status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: 'Invalid transition: researching -> offer'
    });

    // No timeline row should be written on a rejected transition
    const rows = await dbRef.current!.select().from(timelineEvents);
    expect(rows).toHaveLength(0);
  });

  it('application not found: returns 404 with not-found error', async () => {
    const { PATCH } = await import('@/app/api/applications/[id]/status/route');

    const randomId = crypto.randomUUID();
    const { status, body } = await callRoute(PATCH, {
      method: 'PATCH',
      body: { status: 'applied' },
      params: { id: randomId }
    });

    expect(status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      error: 'Application not found'
    });
  });

  it('Zod validation failure (invalid status value): returns 400 with error string', async () => {
    const { PATCH } = await import('@/app/api/applications/[id]/status/route');

    const { status, body } = await callRoute(PATCH, {
      method: 'PATCH',
      body: { status: 'made_up_status' },
      params: { id: appId }
    });

    expect(status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: expect.any(String)
    });
  });
});
