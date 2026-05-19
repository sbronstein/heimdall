import { createTestDb } from '@/test-utils/pglite';
import { callRoute } from '@/test-utils/call-route';
import {
  companies,
  jobLeads,
  timelineEvents
} from '../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import * as scrapeJobPageModule from '@/features/job-leads/lib/scrape-job-page';

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

describe('POST /api/job-leads (company-scope, D-01..D-15)', () => {
  beforeEach(async () => {
    dbRef.current = await createTestDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test C1: company-scope create — empty DB, returns 201 with new lead + companies row + timeline event', async () => {
    const { POST } = await import('@/app/api/job-leads/route');

    const { status, body } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'POST',
        body: {
          companyName: 'AcmeCo',
          linkedinCompanyUrl: 'https://linkedin.com/company/acme'
        }
      }
    );

    expect(status).toBe(201);
    expect(body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        linkedinJobUrl: null,
        roleTitle: 'Company-wide scrape',
        status: 'queued'
      })
    });

    const data = (body as { data: Record<string, unknown> }).data;
    expect(typeof data.companyId).toBe('string');
    expect((data.companyId as string).length).toBeGreaterThan(0);

    // Verify companies row exists with the supplied linkedinUrl
    const companyRows = await dbRef.current!
      .select()
      .from(companies);
    expect(companyRows).toHaveLength(1);
    expect(companyRows[0].name).toBe('AcmeCo');
    expect(companyRows[0].linkedinUrl).toBe('https://linkedin.com/company/acme');
    expect(companyRows[0].id).toBe(data.companyId);

    // Verify timeline event with metadata.scope = 'company'
    const events = await dbRef.current!.select().from(timelineEvents);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('job_lead_created');
    expect(events[0].companyId).toBe(data.companyId);
    const meta = events[0].metadata as Record<string, unknown>;
    expect(meta.scope).toBe('company');
    expect(meta.jobLeadId).toBe(data.id);
  });

  it('Test C2: dedup — re-POST while in-flight returns 200 with existing row, no duplicate insert, no new timeline event', async () => {
    // Seed an in-flight company-scope lead
    const [company] = await dbRef.current!
      .insert(companies)
      .values({ name: 'AcmeCo' })
      .returning();
    const [seedLead] = await dbRef.current!
      .insert(jobLeads)
      .values({
        linkedinJobUrl: null,
        companyId: company.id,
        companyName: 'AcmeCo',
        roleTitle: 'Company-wide scrape',
        status: 'queued'
      })
      .returning();

    const { POST } = await import('@/app/api/job-leads/route');

    const { status, body } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'POST',
        body: { companyName: 'AcmeCo' }
      }
    );

    expect(status).toBe(200);
    const data = (body as { data: { id: string } }).data;
    expect(data.id).toBe(seedLead.id);

    // No duplicate row created
    const leadRows = await dbRef.current!.select().from(jobLeads);
    expect(leadRows).toHaveLength(1);

    // No timeline event emitted on dedup
    const events = await dbRef.current!.select().from(timelineEvents);
    expect(events).toHaveLength(0);
  });

  it('Test C3: backfill linkedinUrl on match-with-null', async () => {
    // Seed a company without linkedinUrl
    const [company] = await dbRef.current!
      .insert(companies)
      .values({ name: 'AcmeCo', linkedinUrl: null })
      .returning();

    const { POST } = await import('@/app/api/job-leads/route');

    const { status } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'POST',
        body: {
          companyName: 'AcmeCo',
          linkedinCompanyUrl: 'https://linkedin.com/company/acme'
        }
      }
    );

    expect(status).toBe(201);

    // The matched row's linkedinUrl is now set
    const companyRows = await dbRef.current!
      .select()
      .from(companies)
      .where(eq(companies.id, company.id));
    expect(companyRows).toHaveLength(1);
    expect(companyRows[0].linkedinUrl).toBe('https://linkedin.com/company/acme');

    // No second companies row created
    const allCompanies = await dbRef.current!.select().from(companies);
    expect(allCompanies).toHaveLength(1);
  });

  it('Test C4: no-overwrite when matched companies row has a non-null linkedinUrl', async () => {
    // Seed a company with a user-curated linkedinUrl
    const [company] = await dbRef.current!
      .insert(companies)
      .values({
        name: 'AcmeCo',
        linkedinUrl: 'https://linkedin.com/company/preserved'
      })
      .returning();

    const { POST } = await import('@/app/api/job-leads/route');

    const { status } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'POST',
        body: {
          companyName: 'AcmeCo',
          linkedinCompanyUrl: 'https://linkedin.com/company/different'
        }
      }
    );

    expect(status).toBe(201);

    // The matched row's linkedinUrl is unchanged (D-09: protect user-curated data)
    const [reread] = await dbRef.current!
      .select()
      .from(companies)
      .where(eq(companies.id, company.id));
    expect(reread.linkedinUrl).toBe('https://linkedin.com/company/preserved');
  });

  it('Test C5: auto-create stub company on no-match (no linkedinCompanyUrl supplied)', async () => {
    const { POST } = await import('@/app/api/job-leads/route');

    const { status, body } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'POST',
        body: { companyName: 'BrandNewCo' }
      }
    );

    expect(status).toBe(201);
    const data = (body as { data: Record<string, unknown> }).data;

    // Stub company exists with name = input, linkedinUrl = null, schema defaults
    const companyRows = await dbRef.current!.select().from(companies);
    expect(companyRows).toHaveLength(1);
    const company = companyRows[0];
    expect(company.name).toBe('BrandNewCo');
    expect(company.linkedinUrl).toBeNull();
    expect(company.stage).toBe('unknown');
    expect(company.priority).toBe('exploring');
    expect(company.remotePolicy).toBe('unknown');
    expect(company.status).toBe('active');
    expect(data.companyId).toBe(company.id);
  });

  it('Test C6: Zod rejects empty body — returns 400, no rows inserted', async () => {
    const { POST } = await import('@/app/api/job-leads/route');

    const { status, body } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'POST',
        body: {}
      }
    );

    expect(status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: expect.any(String)
    });

    const leadRows = await dbRef.current!.select().from(jobLeads);
    expect(leadRows).toHaveLength(0);
    const companyRows = await dbRef.current!.select().from(companies);
    expect(companyRows).toHaveLength(0);
    const events = await dbRef.current!.select().from(timelineEvents);
    expect(events).toHaveLength(0);
  });

  it('Test C7: ambiguous body (both linkedinJobUrl and companyName present) resolves to job-URL branch (D-02 first-match-wins)', async () => {
    // Mock the scraper so this test doesn't hit the network
    vi.spyOn(scrapeJobPageModule, 'scrapeJobPage').mockResolvedValueOnce({
      companyName: 'ScrapedCo',
      roleTitle: 'Scraped Role',
      location: null,
      companyLinkedinUrl: null
    });

    const { POST } = await import('@/app/api/job-leads/route');

    const { status, body } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'POST',
        body: {
          linkedinJobUrl: 'https://www.linkedin.com/jobs/view/999',
          companyName: 'AcmeCo'
        }
      }
    );

    expect(status).toBe(201);
    const data = (body as { data: Record<string, unknown> }).data;

    // Resulting lead has the SCRAPED companyName (not 'AcmeCo'), proving the
    // job-URL branch ran and the company-scope branch did NOT.
    expect(data.companyName).toBe('ScrapedCo');
    expect(data.roleTitle).toBe('Scraped Role');
    expect(data.linkedinJobUrl).toBe('https://www.linkedin.com/jobs/view/999');
    expect(data.status).toBe('scraped');

    // No row exists with linkedinJobUrl: null (i.e. no company-scope lead)
    const allLeads = await dbRef.current!.select().from(jobLeads);
    const companyScopeLeads = allLeads.filter((l) => l.linkedinJobUrl === null);
    expect(companyScopeLeads).toHaveLength(0);
  });
});
