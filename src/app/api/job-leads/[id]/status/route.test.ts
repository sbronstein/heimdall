import { createTestDb } from '@/test-utils/pglite';
import { callRoute } from '@/test-utils/call-route';
import {
  companies,
  jobLeads,
  timelineEvents
} from '../../../../../../drizzle/schema';
import { COMPANY_SCOPE_ROLE_TITLE } from '@/lib/domain/types';

// vi.hoisted + Proxy pattern — mandated by D-05/D-07/02-03-PLAN
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

describe('PATCH /api/job-leads/[id]/status (D-08 state machine)', () => {
  let leadId: string;
  let companyId: string;

  beforeEach(async () => {
    dbRef.current = await createTestDb();

    const [company] = await dbRef.current
      .insert(companies)
      .values({ name: 'AcmeCo' })
      .returning();
    companyId = company.id;

    const [lead] = await dbRef.current
      .insert(jobLeads)
      .values({
        linkedinJobUrl: 'https://www.linkedin.com/jobs/view/4001',
        companyId,
        companyName: 'AcmeCo',
        roleTitle: 'VP Data',
        status: 'scraped'
      })
      .returning();
    leadId = lead.id;
  });

  it('Test 1: scraped -> queued returns 200, clears lastError, emits job_lead_search_queued', async () => {
    const { PATCH } = await import('@/app/api/job-leads/[id]/status/route');

    const { status, body } = await callRoute(
      PATCH as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'PATCH',
        body: { status: 'queued' },
        params: { id: leadId }
      }
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: expect.objectContaining({ id: leadId, status: 'queued' })
    });
    const data = (body as { data: Record<string, unknown> }).data;
    expect(data.lastError).toBeNull();
    expect(data.lastErrorAt).toBeNull();

    const rows = await dbRef.current!.select().from(timelineEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe('job_lead_search_queued');
  });

  it('Test 2: queued -> searching emits job_lead_search_claimed', async () => {
    // Bump the seed lead to queued first
    await dbRef.current!
      .update(jobLeads)
      .set({ status: 'queued' })
      .where((await import('drizzle-orm')).eq(jobLeads.id, leadId));

    const { PATCH } = await import('@/app/api/job-leads/[id]/status/route');

    const { status, body } = await callRoute(
      PATCH as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'PATCH',
        body: { status: 'searching' },
        params: { id: leadId }
      }
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: expect.objectContaining({ status: 'searching' })
    });

    const rows = await dbRef.current!.select().from(timelineEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe('job_lead_search_claimed');
  });

  it('Test 3: searching -> failed sets lastError + lastErrorAt, emits job_lead_search_failed', async () => {
    await dbRef.current!
      .update(jobLeads)
      .set({ status: 'searching' })
      .where((await import('drizzle-orm')).eq(jobLeads.id, leadId));

    const { PATCH } = await import('@/app/api/job-leads/[id]/status/route');

    const { status, body } = await callRoute(
      PATCH as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'PATCH',
        body: {
          status: 'failed',
          lastError: 'Timeout: navigation exceeded 30000ms'
        },
        params: { id: leadId }
      }
    );

    expect(status).toBe(200);
    const data = (body as { data: Record<string, unknown> }).data;
    expect(data.status).toBe('failed');
    expect(data.lastError).toBe('Timeout: navigation exceeded 30000ms');
    expect(data.lastErrorAt).not.toBeNull();

    const rows = await dbRef.current!.select().from(timelineEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe('job_lead_search_failed');
  });

  it('Test 4: failed -> queued (retry) clears lastError + lastErrorAt', async () => {
    await dbRef.current!
      .update(jobLeads)
      .set({
        status: 'failed',
        lastError: 'Previous failure msg',
        lastErrorAt: new Date()
      })
      .where((await import('drizzle-orm')).eq(jobLeads.id, leadId));

    const { PATCH } = await import('@/app/api/job-leads/[id]/status/route');

    const { status, body } = await callRoute(
      PATCH as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'PATCH',
        body: { status: 'queued' },
        params: { id: leadId }
      }
    );

    expect(status).toBe(200);
    const data = (body as { data: Record<string, unknown> }).data;
    expect(data.status).toBe('queued');
    expect(data.lastError).toBeNull();
    expect(data.lastErrorAt).toBeNull();

    const rows = await dbRef.current!.select().from(timelineEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe('job_lead_search_queued');
  });

  it('Test 5: pending -> found is rejected (invalid transition), no mutation, no timeline', async () => {
    await dbRef.current!
      .update(jobLeads)
      .set({ status: 'pending' })
      .where((await import('drizzle-orm')).eq(jobLeads.id, leadId));

    const { PATCH } = await import('@/app/api/job-leads/[id]/status/route');

    const { status, body } = await callRoute(
      PATCH as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'PATCH',
        body: { status: 'found' },
        params: { id: leadId }
      }
    );

    expect(status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: 'Invalid transition: pending -> found'
    });

    // No mutation
    const { eq } = await import('drizzle-orm');
    const [unchanged] = await dbRef.current!
      .select()
      .from(jobLeads)
      .where(eq(jobLeads.id, leadId));
    expect(unchanged.status).toBe('pending');

    // No timeline event
    const rows = await dbRef.current!.select().from(timelineEvents);
    expect(rows).toHaveLength(0);
  });

  it('Test 6: invalid status value returns 400 (Zod error)', async () => {
    const { PATCH } = await import('@/app/api/job-leads/[id]/status/route');

    const { status, body } = await callRoute(
      PATCH as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'PATCH',
        body: { status: 'invalid_value' },
        params: { id: leadId }
      }
    );

    expect(status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: expect.any(String)
    });

    const rows = await dbRef.current!.select().from(timelineEvents);
    expect(rows).toHaveLength(0);
  });

  it('Test 7: non-existent lead returns 404', async () => {
    const { PATCH } = await import('@/app/api/job-leads/[id]/status/route');

    const randomId = crypto.randomUUID();
    const { status, body } = await callRoute(
      PATCH as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'PATCH',
        body: { status: 'queued' },
        params: { id: randomId }
      }
    );

    expect(status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      error: 'Job lead not found'
    });
  });

  it('Test 8: GET regression — returns { status, prospectCount, updatedAt } with NO extra fields', async () => {
    const { GET } = await import('@/app/api/job-leads/[id]/status/route');

    const { status, body } = await callRoute(
      GET as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'GET',
        params: { id: leadId }
      }
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: { status: 'scraped', prospectCount: 0 }
    });
    const data = (body as { success: boolean; data: Record<string, unknown> })
      .data;
    expect(Object.keys(data).sort()).toEqual([
      'prospectCount',
      'status',
      'updatedAt'
    ]);
  });
});

// D-17: Pin the input-shape-agnostic invariant for the PATCH status route.
// The handler operates on `id` lookups and never reads `linkedinJobUrl` — these
// regression tests lock that against a future refactor accidentally adding an
// `if (lead.linkedinJobUrl)` guard that would silently break the company-scope
// drain path. Fixtures use `linkedinJobUrl: null` + `COMPANY_SCOPE_ROLE_TITLE`
// to match the company-scope lead shape produced by Plan 02's POST branch.
describe('PATCH /api/job-leads/[id]/status — company-scope leads (D-17)', () => {
  let leadId: string;
  let companyId: string;

  beforeEach(async () => {
    dbRef.current = await createTestDb();

    const [company] = await dbRef.current
      .insert(companies)
      .values({ name: 'AcmeCo' })
      .returning();
    companyId = company.id;

    const [lead] = await dbRef.current
      .insert(jobLeads)
      .values({
        linkedinJobUrl: null, // company-scope shape — the D-17 invariant
        roleTitle: COMPANY_SCOPE_ROLE_TITLE,
        companyId,
        companyName: 'AcmeCo',
        status: 'queued' // start at queued — the company-scope create branch leaves leads here
      })
      .returning();
    leadId = lead.id;
  });

  it('Test S1: queued -> searching -> found traversal works on a null-URL lead', async () => {
    const { PATCH } = await import('@/app/api/job-leads/[id]/status/route');
    const { eq } = await import('drizzle-orm');

    // Step 1: queued -> searching
    const step1 = await callRoute(
      PATCH as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'PATCH',
        body: { status: 'searching' },
        params: { id: leadId }
      }
    );
    expect(step1.status).toBe(200);
    expect(step1.body).toMatchObject({
      success: true,
      data: expect.objectContaining({ id: leadId, status: 'searching' })
    });
    const step1Data = (step1.body as { data: Record<string, unknown> }).data;
    // D-17 invariant: the handler did not mutate linkedinJobUrl
    expect(step1Data.linkedinJobUrl).toBeNull();

    // Step 2: searching -> found
    const step2 = await callRoute(
      PATCH as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'PATCH',
        body: { status: 'found' },
        params: { id: leadId }
      }
    );
    expect(step2.status).toBe(200);
    expect(step2.body).toMatchObject({
      success: true,
      data: expect.objectContaining({ id: leadId, status: 'found' })
    });
    const step2Data = (step2.body as { data: Record<string, unknown> }).data;
    // D-17 invariant pin: still null after the second PATCH
    expect(step2Data.linkedinJobUrl).toBeNull();

    // Read back the lead and confirm final state + null-URL invariant
    const [finalLead] = await dbRef.current!
      .select()
      .from(jobLeads)
      .where(eq(jobLeads.id, leadId));
    expect(finalLead.status).toBe('found');
    expect(finalLead.linkedinJobUrl).toBeNull();
    expect(finalLead.roleTitle).toBe(COMPANY_SCOPE_ROLE_TITLE);

    // Timeline emitted both transitions
    const rows = await dbRef.current!.select().from(timelineEvents);
    expect(rows).toHaveLength(2);
    const eventTypes = rows.map((r) => r.eventType).sort();
    expect(eventTypes).toEqual(
      ['job_lead_search_claimed', 'job_lead_search_complete'].sort()
    );
  });

  it('Test S2: failed -> queued (retry) clears lastError + lastErrorAt on a null-URL lead', async () => {
    const { eq } = await import('drizzle-orm');

    // Bump the seed lead to failed + populate error fields, mirroring Test 4
    await dbRef.current!
      .update(jobLeads)
      .set({
        status: 'failed',
        lastError: 'simulated',
        lastErrorAt: new Date()
      })
      .where(eq(jobLeads.id, leadId));

    const { PATCH } = await import('@/app/api/job-leads/[id]/status/route');

    const { status, body } = await callRoute(
      PATCH as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'PATCH',
        body: { status: 'queued' },
        params: { id: leadId }
      }
    );

    expect(status).toBe(200);
    const data = (body as { data: Record<string, unknown> }).data;
    expect(data.status).toBe('queued');
    expect(data.lastError).toBeNull();
    expect(data.lastErrorAt).toBeNull();
    // D-17 invariant: the failed -> queued retry did not mutate linkedinJobUrl
    expect(data.linkedinJobUrl).toBeNull();

    const rows = await dbRef.current!.select().from(timelineEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe('job_lead_search_queued');
  });
});
