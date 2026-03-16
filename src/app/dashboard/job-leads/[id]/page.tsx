import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { jobLeads, prospectBridges, prospects, contacts } from '../../../../../drizzle/schema';
import { eq, isNull, and, inArray } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { JobLeadDetail } from '@/features/job-leads/components/job-lead-detail';

export const metadata = {
  title: 'Dashboard: Job Lead Detail'
};

export default async function JobLeadDetailRoute({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [lead] = await db
    .select()
    .from(jobLeads)
    .where(eq(jobLeads.id, id))
    .limit(1);

  if (!lead) return notFound();

  // Count untriaged contacts connected via prospect bridges
  let untriagedCount = 0;
  if (lead.status === 'found' || lead.status === 'ready') {
    const bridges = await db
      .select({ contactId: prospectBridges.contactId })
      .from(prospectBridges)
      .innerJoin(prospects, eq(prospectBridges.prospectId, prospects.id))
      .where(eq(prospects.jobLeadId, id));

    const contactIds = Array.from(new Set(bridges.map((b) => b.contactId)));

    if (contactIds.length > 0) {
      const untriagedContacts = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            inArray(contacts.id, contactIds),
            isNull(contacts.triagedAt),
            isNull(contacts.archivedAt)
          )
        );
      untriagedCount = untriagedContacts.length;
    }
  }

  return (
    <PageContainer scrollable pageTitle={lead.companyName || 'Job Lead'}>
      <JobLeadDetail lead={lead} untriagedCount={untriagedCount} />
    </PageContainer>
  );
}
