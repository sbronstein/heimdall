import { createTestDb } from '@/test-utils/pglite';
import {
  contacts,
  outreachCampaigns,
  outreachEmails
} from '../../../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Phase 11 schema regression', () => {
  it('outreach_emails: defaults (status=pending, channel=email) and nullable editedSubject read back correctly', async () => {
    const db = await createTestDb();

    // Seed FK targets — contacts.firstName and contacts.lastName are .notNull()
    const [contact] = await db
      .insert(contacts)
      .values({ firstName: 'Jane', lastName: 'Doe' })
      .returning();

    const [campaign] = await db
      .insert(outreachCampaigns)
      .values({ name: 'Test Campaign', goalInstruction: 'Get an intro' })
      .returning();

    // Insert with editedSubject: null — D-09 nullable content
    const [inserted] = await db
      .insert(outreachEmails)
      .values({
        campaignId: campaign.id,
        contactId: contact.id,
        editedSubject: null
      })
      .returning();

    // Defaults pinned
    expect(inserted.status).toBe('pending');
    expect(inserted.channel).toBe('email');
    expect(inserted.editedSubject).toBeNull();

    // Read-back end-to-end (write + read parity)
    const [readBack] = await db
      .select()
      .from(outreachEmails)
      .where(eq(outreachEmails.id, inserted.id));

    expect(readBack.status).toBe('pending');
    expect(readBack.channel).toBe('email');
    expect(readBack.editedSubject).toBeNull();
  });

  it('outreach_emails: UNIQUE (campaign_id, contact_id) rejects a duplicate row (T-11-06)', async () => {
    const db = await createTestDb();

    const [contact] = await db
      .insert(contacts)
      .values({ firstName: 'John', lastName: 'Smith' })
      .returning();

    const [campaign] = await db
      .insert(outreachCampaigns)
      .values({
        name: 'Unique Constraint Campaign',
        goalInstruction: 'Test uniqueness'
      })
      .returning();

    // First insert succeeds
    await db
      .insert(outreachEmails)
      .values({ campaignId: campaign.id, contactId: contact.id })
      .returning();

    // Second insert with identical (campaignId, contactId) must be rejected
    await expect(
      db
        .insert(outreachEmails)
        .values({ campaignId: campaign.id, contactId: contact.id })
        .returning()
    ).rejects.toThrow();
  });
});
