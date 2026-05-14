import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb } from '@/test-utils/pglite';
import { callRoute } from '@/test-utils/call-route';
import {
  companies,
  jobLeads,
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

describe('POST /api/job-leads/[id]/search (thin status flip)', () => {
  let scrapedLeadId: string;
  let failedLeadId: string;
  let companyId: string;

  beforeEach(async () => {
    dbRef.current = await createTestDb();

    const [company] = await dbRef.current
      .insert(companies)
      .values({ name: 'AcmeCo' })
      .returning();
    companyId = company.id;

    const [scrapedLead] = await dbRef.current
      .insert(jobLeads)
      .values({
        linkedinJobUrl: 'https://www.linkedin.com/jobs/view/4001',
        companyId,
        companyName: 'AcmeCo',
        status: 'scraped'
      })
      .returning();
    scrapedLeadId = scrapedLead.id;

    const [failedLead] = await dbRef.current
      .insert(jobLeads)
      .values({
        linkedinJobUrl: 'https://www.linkedin.com/jobs/view/4002',
        companyId,
        companyName: 'AcmeCo',
        status: 'failed',
        lastError: 'Timeout: prior search hit 30s',
        lastErrorAt: new Date()
      })
      .returning();
    failedLeadId = failedLead.id;
  });

  it('Test 7: scraped -> queued returns 200, clears lastError, emits job_lead_search_queued', async () => {
    const { POST } = await import('@/app/api/job-leads/[id]/search/route');

    const { status, body } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      { method: 'POST', params: { id: scrapedLeadId } }
    );

    expect(status).toBe(200);
    const data = (body as { data: Record<string, unknown> }).data;
    expect(data.status).toBe('queued');
    expect(data.lastError).toBeNull();

    const events = await dbRef.current!.select().from(timelineEvents);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('job_lead_search_queued');
  });

  it('Test 8: failed -> queued (retry) clears lastError + lastErrorAt', async () => {
    const { POST } = await import('@/app/api/job-leads/[id]/search/route');

    const { status, body } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      { method: 'POST', params: { id: failedLeadId } }
    );

    expect(status).toBe(200);
    const data = (body as { data: Record<string, unknown> }).data;
    expect(data.status).toBe('queued');
    expect(data.lastError).toBeNull();
    expect(data.lastErrorAt).toBeNull();
  });

  it("Test 9: searching -> queued rejected (canJobLeadTransition gate); no DB mutation", async () => {
    // Flip lead to 'searching' so the canJobLeadTransition gate must reject
    await dbRef.current!
      .update(jobLeads)
      .set({ status: 'searching' })
      .where(eq(jobLeads.id, scrapedLeadId));

    const { POST } = await import('@/app/api/job-leads/[id]/search/route');

    const { status, body } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      { method: 'POST', params: { id: scrapedLeadId } }
    );

    expect(status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: "Cannot queue lead in status 'searching'"
    });

    const [unchanged] = await dbRef.current!
      .select()
      .from(jobLeads)
      .where(eq(jobLeads.id, scrapedLeadId));
    expect(unchanged.status).toBe('searching');

    const events = await dbRef.current!.select().from(timelineEvents);
    expect(events).toHaveLength(0);
  });

  it('Test 10: non-existent lead returns 404', async () => {
    const { POST } = await import('@/app/api/job-leads/[id]/search/route');

    const randomId = crypto.randomUUID();
    const { status, body } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      { method: 'POST', params: { id: randomId } }
    );

    expect(status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      error: 'Job lead not found'
    });
  });

  it('Test 11: route file does NOT import scrapeConnections, matchConnections, inferSeniority', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const routePath = path.resolve(__dirname, './route.ts');
    const content = readFileSync(routePath, 'utf-8');
    expect(content).not.toMatch(/scrapeConnections/);
    expect(content).not.toMatch(/matchConnections/);
    expect(content).not.toMatch(/inferSeniority/);
    // Single source of truth — must use canJobLeadTransition gate
    expect(content).toMatch(/canJobLeadTransition/);
  });
});
