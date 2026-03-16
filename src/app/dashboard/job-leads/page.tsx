import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { jobLeads } from '../../../../drizzle/schema';
import { desc, isNull } from 'drizzle-orm';
import { JobLeadsPage } from '@/features/job-leads/components/job-leads-page';

export const metadata = {
  title: 'Dashboard: Job Leads'
};

export default async function JobLeadsRoute() {
  const leads = await db
    .select()
    .from(jobLeads)
    .where(isNull(jobLeads.archivedAt))
    .orderBy(desc(jobLeads.updatedAt));

  return (
    <PageContainer
      scrollable
      pageTitle='Job Leads'
      pageDescription='Paste a LinkedIn job URL to find the best intro path through your network.'
    >
      <JobLeadsPage initialLeads={leads} />
    </PageContainer>
  );
}
