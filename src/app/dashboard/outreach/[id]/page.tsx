import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import {
  outreachCampaigns,
  outreachEmails,
  contacts
} from '../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { CampaignReviewPage } from '@/features/outreach/components/campaign-review-page';

export default async function OutreachCampaignPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch the campaign — call notFound() when the id does not exist (D-13)
  const [campaign] = await db
    .select()
    .from(outreachCampaigns)
    .where(eq(outreachCampaigns.id, id))
    .limit(1);

  if (!campaign) return notFound();

  // Fetch emails joined to contacts — mirrors the emails GET route shape
  const emails = await db
    .select({ email: outreachEmails, contact: contacts })
    .from(outreachEmails)
    .leftJoin(contacts, eq(outreachEmails.contactId, contacts.id))
    .where(eq(outreachEmails.campaignId, id));

  return (
    <PageContainer scrollable pageTitle={campaign.name}>
      <CampaignReviewPage campaign={campaign} emails={emails} />
    </PageContainer>
  );
}
