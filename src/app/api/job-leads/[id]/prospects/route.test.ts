import { createTestDb } from '@/test-utils/pglite';
import { callRoute } from '@/test-utils/call-route';
import {
  companies,
  jobLeads,
  prospects,
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

describe('POST /api/job-leads/[id]/prospects (bulk insert)', () => {
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
        status: 'searching'
      })
      .returning();
    leadId = lead.id;
  });

  it('Test 1: POST 5 prospects flips status to found, bulk-inserts, emits job_lead_search_complete', async () => {
    const { POST } = await import('@/app/api/job-leads/[id]/prospects/route');

    const inputProspects = [
      {
        name: 'Alice',
        title: 'CTO',
        linkedinUrl: 'https://linkedin.com/in/alice',
        profileSnippet: 'Building data infra. ex-Stripe.',
        mutualConnectionNames: []
      },
      {
        name: 'Bob',
        title: 'VP Eng',
        linkedinUrl: 'https://linkedin.com/in/bob',
        profileSnippet: 'Eng leader',
        mutualConnectionNames: ['Carol']
      },
      {
        name: 'Carol',
        title: 'Director',
        linkedinUrl: 'https://linkedin.com/in/carol',
        profileSnippet: null,
        mutualConnectionNames: []
      },
      {
        name: 'Dave',
        title: null,
        linkedinUrl: null,
        profileSnippet: null,
        mutualConnectionNames: []
      },
      {
        name: 'Eve',
        title: 'Senior Manager',
        linkedinUrl: 'https://linkedin.com/in/eve',
        profileSnippet: 'Operations',
        mutualConnectionNames: ['Fred']
      }
    ];

    const { status, body } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'POST',
        body: { prospects: inputProspects },
        params: { id: leadId }
      }
    );

    expect(status).toBe(201);
    expect(body).toMatchObject({
      success: true,
      data: expect.objectContaining({ insertedCount: 5 })
    });

    // Lead flipped to 'found' with prospectCount = 5
    const [updatedLead] = await dbRef.current!
      .select()
      .from(jobLeads)
      .where(eq(jobLeads.id, leadId));
    expect(updatedLead.status).toBe('found');
    expect(updatedLead.prospectCount).toBe(5);
    expect(updatedLead.lastError).toBeNull();
    expect(updatedLead.lastErrorAt).toBeNull();

    // Timeline emitted
    const events = await dbRef.current!.select().from(timelineEvents);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('job_lead_search_complete');
    const meta = events[0].metadata as Record<string, unknown>;
    expect(meta.prospectCount).toBe(5);
  });

  it('Test 1b: profileSnippet round-trip — each row persists the input snippet (including null)', async () => {
    const { POST } = await import('@/app/api/job-leads/[id]/prospects/route');

    const inputProspects = [
      {
        name: 'Alice',
        title: 'CTO',
        linkedinUrl: 'https://linkedin.com/in/alice',
        profileSnippet: 'Building data infra. ex-Stripe.',
        mutualConnectionNames: []
      },
      {
        name: 'Bob',
        title: null,
        linkedinUrl: null,
        profileSnippet: null,
        mutualConnectionNames: []
      }
    ];

    const { status } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'POST',
        body: { prospects: inputProspects },
        params: { id: leadId }
      }
    );
    expect(status).toBe(201);

    const persisted = await dbRef.current!
      .select()
      .from(prospects)
      .where(eq(prospects.jobLeadId, leadId));

    expect(persisted).toHaveLength(2);
    const alice = persisted.find((p) => p.name === 'Alice')!;
    const bob = persisted.find((p) => p.name === 'Bob')!;
    expect(alice.profileSnippet).toBe('Building data infra. ex-Stripe.');
    expect(bob.profileSnippet).toBeNull();
  });

  it('Test 2: empty name string is rejected by Zod', async () => {
    const { POST } = await import('@/app/api/job-leads/[id]/prospects/route');

    const { status, body } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'POST',
        body: {
          prospects: [
            {
              name: '',
              title: 'X',
              linkedinUrl: null,
              profileSnippet: null,
              mutualConnectionNames: []
            }
          ]
        },
        params: { id: leadId }
      }
    );

    expect(status).toBe(400);
    expect(body).toMatchObject({ success: false, error: expect.any(String) });

    const persisted = await dbRef.current!.select().from(prospects);
    expect(persisted).toHaveLength(0);
  });

  it('Test 3: more than 200 prospects rejected', async () => {
    const { POST } = await import('@/app/api/job-leads/[id]/prospects/route');

    const tooMany = Array.from({ length: 201 }, (_, i) => ({
      name: `P${i}`,
      title: null,
      linkedinUrl: null,
      profileSnippet: null,
      mutualConnectionNames: []
    }));

    const { status } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'POST',
        body: { prospects: tooMany },
        params: { id: leadId }
      }
    );
    expect(status).toBe(400);

    const persisted = await dbRef.current!.select().from(prospects);
    expect(persisted).toHaveLength(0);
  });

  it("Test 4: lead in 'pending' status rejects write with status-mismatch error", async () => {
    await dbRef.current!
      .update(jobLeads)
      .set({ status: 'pending' })
      .where(eq(jobLeads.id, leadId));

    const { POST } = await import('@/app/api/job-leads/[id]/prospects/route');

    const { status, body } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'POST',
        body: {
          prospects: [
            {
              name: 'Alice',
              title: null,
              linkedinUrl: null,
              profileSnippet: null,
              mutualConnectionNames: []
            }
          ]
        },
        params: { id: leadId }
      }
    );

    expect(status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: "Cannot write prospects to lead in status 'pending'"
    });

    const persisted = await dbRef.current!.select().from(prospects);
    expect(persisted).toHaveLength(0);
  });

  it('Test 5: non-existent lead returns 404', async () => {
    const { POST } = await import('@/app/api/job-leads/[id]/prospects/route');

    const randomId = crypto.randomUUID();
    const { status, body } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'POST',
        body: {
          prospects: [
            {
              name: 'Alice',
              title: null,
              linkedinUrl: null,
              profileSnippet: null,
              mutualConnectionNames: []
            }
          ]
        },
        params: { id: randomId }
      }
    );

    expect(status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      error: 'Job lead not found'
    });
  });

  it('Test 6: bulk insert uses single statement (regression — row count matches input length)', async () => {
    const { POST } = await import('@/app/api/job-leads/[id]/prospects/route');

    const inputProspects = Array.from({ length: 5 }, (_, i) => ({
      name: `Person${i}`,
      title: null,
      linkedinUrl: null,
      profileSnippet: null,
      mutualConnectionNames: []
    }));

    const { status } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'POST',
        body: { prospects: inputProspects },
        params: { id: leadId }
      }
    );
    expect(status).toBe(201);

    const persisted = await dbRef.current!
      .select()
      .from(prospects)
      .where(eq(prospects.jobLeadId, leadId));
    expect(persisted).toHaveLength(5);
  });
});
