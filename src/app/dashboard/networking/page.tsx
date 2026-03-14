import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { contacts } from '../../../../drizzle/schema';
import { isNull, desc } from 'drizzle-orm';
import { NetworkingDashboard } from '@/features/networking/components/networking-dashboard';

export const metadata = {
  title: 'Dashboard: Networking'
};

export default async function NetworkingPage() {
  const allContacts = await db
    .select()
    .from(contacts)
    .where(isNull(contacts.archivedAt))
    .orderBy(desc(contacts.updatedAt));

  return (
    <PageContainer
      scrollable
      pageTitle='Networking'
      pageDescription='Track outreach, find connections, and manage your network.'
    >
      <NetworkingDashboard contacts={allContacts} />
    </PageContainer>
  );
}
