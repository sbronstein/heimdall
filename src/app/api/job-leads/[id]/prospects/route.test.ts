import { createTestDb } from '@/test-utils/pglite';
import { callRoute } from '@/test-utils/call-route';
import {
  companies,
  contacts,
  jobLeads,
  prospects,
  prospectBridges,
  timelineEvents
} from '../../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import * as matchConnectionsModule from '@/features/job-leads/lib/match-connections';
import { COMPANY_SCOPE_ROLE_TITLE } from '@/lib/domain/types';

// No vi.mock for matchConnections. Tests 1, 1b, 2, 4, 5, 6 use the real
// implementation via the seeded PGlite database. Test 3 uses vi.spyOn +
// mockRejectedValueOnce (BLOCKER 2 fix — single decisive mock strategy).

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

  it('Test 7: inline matchConnections inserts bridges for matched mutual connections (D-01, D-04)', async () => {
    const [carol, dave] = await dbRef.current!
      .insert(contacts)
      .values([
        {
          firstName: 'Carol',
          lastName: 'Chen'
        },
        {
          firstName: 'Dave',
          lastName: 'Davis'
        }
      ])
      .returning();

    const { POST } = await import('@/app/api/job-leads/[id]/prospects/route');
    const { status, body } = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'POST',
        params: { id: leadId },
        body: {
          prospects: [
            {
              name: 'Alice',
              title: 'CTO',
              linkedinUrl: 'https://linkedin.com/in/alice',
              profileSnippet: null,
              mutualConnectionNames: ['Carol Chen', 'Dave Davis']
            }
          ]
        }
      }
    );

    expect(status).toBe(201);
    const data = (body as { data: { insertedCount: number } }).data;
    expect(data.insertedCount).toBe(1);

    const bridges = await dbRef.current!.select().from(prospectBridges);
    expect(bridges).toHaveLength(2);
    const bridgedContactIds = bridges.map((b) => b.contactId).sort();
    expect(bridgedContactIds).toEqual([carol.id, dave.id].sort());
  });

  it('Test 8: rollback on matchConnections failure leaves no prospects, bridges, or timeline events (D-02)', async () => {
    const spy = vi.spyOn(matchConnectionsModule, 'matchConnections')
      .mockRejectedValueOnce(new Error('forced rollback'));

    try {
      const { POST } = await import('@/app/api/job-leads/[id]/prospects/route');
      const { status } = await callRoute(
        POST as unknown as Parameters<typeof callRoute>[0],
        {
          method: 'POST',
          params: { id: leadId },
          body: {
            prospects: [
              {
                name: 'Alice',
                title: 'CTO',
                linkedinUrl: null,
                profileSnippet: null,
                mutualConnectionNames: []
              },
              {
                name: 'Bob',
                title: 'VP',
                linkedinUrl: null,
                profileSnippet: null,
                mutualConnectionNames: []
              }
            ]
          }
        }
      );
      expect(status).toBe(500);

      // FOUR rollback invariants (D-02):
      const prospectRows = await dbRef.current!.select().from(prospects);
      expect(prospectRows).toHaveLength(0);

      const bridgeRows = await dbRef.current!.select().from(prospectBridges);
      expect(bridgeRows).toHaveLength(0);

      // Post-commit-only invariant: logTimeline never runs when tx rolls back
      const timelineRows = await dbRef.current!.select().from(timelineEvents);
      expect(timelineRows).toHaveLength(0);

      const [leadAfter] = await dbRef.current!
        .select()
        .from(jobLeads)
        .where(eq(jobLeads.id, leadId));
      expect(leadAfter.status).toBe('searching');
    } finally {
      spy.mockRestore();
    }
  });

  it('Test 9: second call to same lead returns 400 (status check rejects), DB state unchanged', async () => {
    const { POST } = await import('@/app/api/job-leads/[id]/prospects/route');
    const callBody = {
      prospects: [
        {
          name: 'A',
          title: 'CTO',
          linkedinUrl: null,
          profileSnippet: null,
          mutualConnectionNames: []
        },
        {
          name: 'B',
          title: 'VP',
          linkedinUrl: null,
          profileSnippet: null,
          mutualConnectionNames: []
        },
        {
          name: 'C',
          title: 'Dir',
          linkedinUrl: null,
          profileSnippet: null,
          mutualConnectionNames: []
        }
      ]
    };

    const first = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      { method: 'POST', params: { id: leadId }, body: callBody }
    );
    expect(first.status).toBe(201);

    const second = await callRoute(
      POST as unknown as Parameters<typeof callRoute>[0],
      { method: 'POST', params: { id: leadId }, body: callBody }
    );
    expect(second.status).toBe(400);
    expect((second.body as { error: string }).error).toContain(
      "Cannot write prospects to lead in status 'found'"
    );

    const prospectRows = await dbRef.current!.select().from(prospects);
    expect(prospectRows).toHaveLength(3);

    // Exactly 1 timeline event total — post-commit emission is idempotent
    const timelineRows = await dbRef.current!.select().from(timelineEvents);
    expect(timelineRows).toHaveLength(1);
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

// D-17: Pin the input-shape-agnostic invariant for the POST prospects route.
// The handler operates on `id` lookups and branches only on `lead.status`
// (never on `linkedinJobUrl`). A regression test with `linkedinJobUrl: null`
// locks this against a future refactor accidentally adding an
// `if (lead.linkedinJobUrl)` guard that would break the company-scope drain.
describe('POST /api/job-leads/[id]/prospects — company-scope leads (D-17)', () => {
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
        status: 'searching' // prospects route precondition — ready for bulk insert
      })
      .returning();
    leadId = lead.id;
  });

  it('Test P1: bulk-prospects + status flip works on null-URL lead (D-17)', async () => {
    const { POST } = await import('@/app/api/job-leads/[id]/prospects/route');

    // Mirror Test 1's shape: 5 prospects with mixed null/string fields covering
    // every nullable column (title, linkedinUrl, profileSnippet) and both
    // empty / non-empty mutualConnectionNames arrays.
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
      data: expect.objectContaining({ insertedCount: inputProspects.length })
    });

    // Read back the lead — assert status flip + null-URL invariant + clean error fields
    const [updatedLead] = await dbRef.current!
      .select()
      .from(jobLeads)
      .where(eq(jobLeads.id, leadId));
    expect(updatedLead.status).toBe('found');
    expect(updatedLead.prospectCount).toBe(inputProspects.length);
    expect(updatedLead.lastError).toBeNull();
    expect(updatedLead.lastErrorAt).toBeNull();
    // D-17 invariant pin: handler did not mutate the null-URL shape
    expect(updatedLead.linkedinJobUrl).toBeNull();

    // Timeline emitted with the search-complete event
    const events = await dbRef.current!.select().from(timelineEvents);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('job_lead_search_complete');
    const meta = events[0].metadata as Record<string, unknown>;
    expect(meta.prospectCount).toBe(inputProspects.length);
  });
});
