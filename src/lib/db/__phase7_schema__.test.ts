import { createTestDb } from '@/test-utils/pglite';
import { jobLeads, companies } from '../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { COMPANY_SCOPE_ROLE_TITLE } from '@/lib/domain/types';

describe('Phase 7 schema regression (D-06)', () => {
  it('job_leads accepts linkedinJobUrl: null with the canonical roleTitle sentinel', async () => {
    const db = await createTestDb();

    // Seed a companies row so the FK on companyId is valid
    const [company] = await db
      .insert(companies)
      .values({ name: 'TestCo' })
      .returning();

    // Constraint under test: linkedin_job_url is now nullable after migration 0009.
    // The insert must succeed without DB-side rejection.
    const [inserted] = await db
      .insert(jobLeads)
      .values({
        linkedinJobUrl: null,
        roleTitle: COMPANY_SCOPE_ROLE_TITLE,
        companyName: 'TestCo',
        companyId: company.id,
        status: 'queued'
      })
      .returning();

    expect(inserted.linkedinJobUrl).toBeNull();
    expect(inserted.roleTitle).toBe('Company-wide scrape');
    expect(inserted.status).toBe('queued');

    // Read-back via SELECT — pins the shape end-to-end (write + read parity)
    const [readBack] = await db
      .select()
      .from(jobLeads)
      .where(eq(jobLeads.id, inserted.id));

    expect(readBack.linkedinJobUrl).toBeNull();
    expect(readBack.roleTitle).toBe('Company-wide scrape');
    expect(readBack.status).toBe('queued');
  });

  it('job_leads accepts linkedinJobUrl: null AND roleTitle: null (both fields null — defensive)', async () => {
    const db = await createTestDb();

    const [company] = await db
      .insert(companies)
      .values({ name: 'TestCo2' })
      .returning();

    // Phase 7 success criterion 2 wording: "inserts and reads back a row with both fields null".
    // roleTitle was already nullable; this case pins that the relaxation of linkedin_job_url
    // does not introduce any new coupling between the two columns.
    const [inserted] = await db
      .insert(jobLeads)
      .values({
        linkedinJobUrl: null,
        roleTitle: null,
        companyName: 'TestCo2',
        companyId: company.id,
        status: 'queued'
      })
      .returning();

    expect(inserted.linkedinJobUrl).toBeNull();
    expect(inserted.roleTitle).toBeNull();

    const [readBack] = await db
      .select()
      .from(jobLeads)
      .where(eq(jobLeads.id, inserted.id));

    expect(readBack.linkedinJobUrl).toBeNull();
    expect(readBack.roleTitle).toBeNull();
  });
});
