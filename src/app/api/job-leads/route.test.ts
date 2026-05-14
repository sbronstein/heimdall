import { createTestDb } from '@/test-utils/pglite';
import { callRoute } from '@/test-utils/call-route';
import { companies, jobLeads } from '../../../../drizzle/schema';

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

describe('GET /api/job-leads (status filter)', () => {
  let companyId: string;

  beforeEach(async () => {
    dbRef.current = await createTestDb();

    const [company] = await dbRef.current
      .insert(companies)
      .values({ name: 'AcmeCo' })
      .returning();
    companyId = company.id;

    await dbRef.current.insert(jobLeads).values([
      {
        linkedinJobUrl: 'https://www.linkedin.com/jobs/view/1',
        companyId,
        companyName: 'AcmeCo',
        status: 'queued'
      },
      {
        linkedinJobUrl: 'https://www.linkedin.com/jobs/view/2',
        companyId,
        companyName: 'AcmeCo',
        status: 'scraped'
      },
      {
        linkedinJobUrl: 'https://www.linkedin.com/jobs/view/3',
        companyId,
        companyName: 'AcmeCo',
        status: 'failed'
      }
    ]);
  });

  it('Test 12: ?status=queued returns only queued leads', async () => {
    const { GET } = await import('@/app/api/job-leads/route');

    const { status, body } = await callRoute(
      GET as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'GET',
        searchParams: { status: 'queued' }
      }
    );

    expect(status).toBe(200);
    const data = (body as { data: Array<{ status: string }> }).data;
    expect(data).toHaveLength(1);
    expect(data[0].status).toBe('queued');
    const meta = (body as { meta: { hasMore: boolean } }).meta;
    expect(meta.hasMore).toBe(false);
  });

  it('Test 13: ?status=queued,failed returns queued + failed (multi-value)', async () => {
    const { GET } = await import('@/app/api/job-leads/route');

    const { status, body } = await callRoute(
      GET as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'GET',
        searchParams: { status: 'queued,failed' }
      }
    );

    expect(status).toBe(200);
    const data = (body as { data: Array<{ status: string }> }).data;
    expect(data).toHaveLength(2);
    const statuses = data.map((l) => l.status).sort();
    expect(statuses).toEqual(['failed', 'queued']);
  });

  it('Test 14: no status param preserves existing behavior — returns all non-archived leads', async () => {
    const { GET } = await import('@/app/api/job-leads/route');

    const { status, body } = await callRoute(
      GET as unknown as Parameters<typeof callRoute>[0],
      { method: 'GET' }
    );

    expect(status).toBe(200);
    const data = (body as { data: unknown[] }).data;
    expect(data).toHaveLength(3);
  });
});
