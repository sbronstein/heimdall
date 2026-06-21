import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { contacts } from '../../../../../drizzle/schema';
import { isNull } from 'drizzle-orm';
import { CampaignBuilder } from '@/features/outreach/components/campaign-builder';

export const metadata = {
  title: 'Dashboard: New Campaign'
};

// D-05/D-06: load ALL non-archived contacts server-side.
// GET /api/contacts is NOT used here — its parseLimit caps at 100, which would miss
// the majority of the ~1500-contact set. Direct DB read is required.
export default async function NewCampaignPage() {
  const allContacts = await db
    .select()
    .from(contacts)
    .where(isNull(contacts.archivedAt));

  return (
    <PageContainer scrollable={false} pageTitle='New Campaign'>
      <CampaignBuilder contacts={allContacts} />
    </PageContainer>
  );
}
