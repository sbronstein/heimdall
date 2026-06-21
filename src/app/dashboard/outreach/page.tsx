import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';
import { outreachCampaigns, outreachEmails } from '../../../../drizzle/schema';
import { desc, eq, isNull, sql } from 'drizzle-orm';
import { CampaignList } from '@/features/outreach/components/campaign-list';

export const metadata = {
  title: 'Dashboard: Outreach'
};

export default async function OutreachPage() {
  const campaigns = await db
    .select({
      id: outreachCampaigns.id,
      name: outreachCampaigns.name,
      goalInstruction: outreachCampaigns.goalInstruction,
      status: outreachCampaigns.status,
      createdAt: outreachCampaigns.createdAt,
      updatedAt: outreachCampaigns.updatedAt,
      archivedAt: outreachCampaigns.archivedAt,
      emailCounts: sql<Record<string, number>>`
        json_build_object(
          'pending',   count(*) FILTER (WHERE ${outreachEmails.status} = 'pending'),
          'generated', count(*) FILTER (WHERE ${outreachEmails.status} = 'generated'),
          'edited',    count(*) FILTER (WHERE ${outreachEmails.status} = 'edited'),
          'approved',  count(*) FILTER (WHERE ${outreachEmails.status} = 'approved'),
          'drafted',   count(*) FILTER (WHERE ${outreachEmails.status} = 'drafted'),
          'failed',    count(*) FILTER (WHERE ${outreachEmails.status} = 'failed')
        )`
    })
    .from(outreachCampaigns)
    .leftJoin(
      outreachEmails,
      eq(outreachEmails.campaignId, outreachCampaigns.id)
    )
    .where(isNull(outreachCampaigns.archivedAt))
    .groupBy(outreachCampaigns.id)
    .orderBy(desc(outreachCampaigns.updatedAt));

  const initialCampaigns = campaigns.map((c) => ({
    ...c,
    emailCounts: (c.emailCounts ?? {}) as Record<string, number>
  }));

  return (
    <PageContainer
      scrollable
      pageTitle='Outreach'
      pageDescription='Manage email campaigns for your job search network.'
      pageHeaderAction={
        <Link href='/dashboard/outreach/new'>
          <Button size='sm'>New Campaign</Button>
        </Link>
      }
    >
      <CampaignList initialCampaigns={initialCampaigns} />
    </PageContainer>
  );
}
