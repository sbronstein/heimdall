import { createTestDb } from '@/test-utils/pglite';
import { callRoute } from '@/test-utils/call-route';
import {
  outreachCampaigns,
  outreachEmails,
  contacts,
  timelineEvents
} from '../../../../../../../../drizzle/schema';

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

describe('PATCH /api/outreach-campaigns/[id]/emails/[emailId]/generation (T-16-01 status guard)', () => {
  let campaignId: string;
  let contactId: string;

  beforeEach(async () => {
    dbRef.current = await createTestDb();

    // Seed a campaign (goalInstruction is NOT NULL)
    const [campaign] = await dbRef.current
      .insert(outreachCampaigns)
      .values({
        name: 'Test Campaign',
        goalInstruction: 'Reconnect with former colleagues at Target Co'
      })
      .returning();
    campaignId = campaign.id;

    // Seed a contact (firstName + lastName are NOT NULL)
    const [contact] = await dbRef.current
      .insert(contacts)
      .values({
        firstName: 'Jane',
        lastName: 'Doe'
      })
      .returning();
    contactId = contact.id;
  });

  it('Test 1: pending email PATCHed with content returns 200, status="generated", non-null generatedAt, written subject/body', async () => {
    const [email] = await dbRef
      .current!.insert(outreachEmails)
      .values({
        campaignId,
        contactId,
        status: 'pending'
      })
      .returning();

    const { PATCH } = await import(
      '@/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route'
    );

    const { status, body } = await callRoute(
      PATCH as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'PATCH',
        body: {
          generatedSubject: 'Hey Jane, catching up',
          generatedBody: 'Hi Jane, I wanted to reconnect...'
        },
        params: { id: campaignId, emailId: email.id }
      }
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        id: email.id,
        status: 'generated',
        generatedSubject: 'Hey Jane, catching up',
        generatedBody: 'Hi Jane, I wanted to reconnect...'
      })
    });
    const data = (body as { data: Record<string, unknown> }).data;
    expect(data.generatedAt).not.toBeNull();

    // Exactly one timeline event
    const rows = await dbRef.current!.select().from(timelineEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe('outreach_email_generated');
  });

  it('Test 2: approved email PATCHed with content returns 400 with "Invalid transition" and status unchanged', async () => {
    const [email] = await dbRef
      .current!.insert(outreachEmails)
      .values({
        campaignId,
        contactId,
        status: 'approved'
      })
      .returning();

    const { PATCH } = await import(
      '@/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route'
    );

    const { status, body } = await callRoute(
      PATCH as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'PATCH',
        body: {
          generatedSubject: 'Override attempt',
          generatedBody: 'Attempting to overwrite approved email'
        },
        params: { id: campaignId, emailId: email.id }
      }
    );

    expect(status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: 'Invalid transition: approved -> generated'
    });

    // Status must be unchanged — still approved
    const { eq } = await import('drizzle-orm');
    const [unchanged] = await dbRef
      .current!.select()
      .from(outreachEmails)
      .where(eq(outreachEmails.id, email.id));
    expect(unchanged.status).toBe('approved');

    // No timeline event
    const rows = await dbRef.current!.select().from(timelineEvents);
    expect(rows).toHaveLength(0);
  });

  it('Test 3: non-existent emailId returns 404', async () => {
    const { PATCH } = await import(
      '@/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route'
    );

    const randomId = crypto.randomUUID();

    const { status, body } = await callRoute(
      PATCH as unknown as Parameters<typeof callRoute>[0],
      {
        method: 'PATCH',
        body: {
          generatedSubject: 'Subject',
          generatedBody: 'Body content here'
        },
        params: { id: campaignId, emailId: randomId }
      }
    );

    expect(status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      error: 'Email not found'
    });
  });
});
