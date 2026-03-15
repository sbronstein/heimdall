import PageContainer from '@/components/layout/page-container';
import { buttonVariants } from '@/components/ui/button';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import ContactListingPage from '@/features/contacts/components/contact-listing';
import { LinkedInImportDialog } from '@/features/contacts/components/linkedin-import/linkedin-import-dialog';
import { cn } from '@/lib/utils';
import { IconPlus, IconCards } from '@tabler/icons-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { db } from '@/lib/db';
import { contacts } from '../../../../drizzle/schema';
import { and, isNull, count } from 'drizzle-orm';

export const metadata = {
  title: 'Dashboard: Contacts'
};

export default async function ContactsPage() {
  const [{ value: untriagedCount }] = await db
    .select({ value: count() })
    .from(contacts)
    .where(
      and(
        isNull(contacts.triagedAt),
        isNull(contacts.archivedAt)
      )
    );

  return (
    <PageContainer
      scrollable={false}
      pageTitle='Contacts'
      pageDescription='Manage your network of recruiters, hiring managers, and connections.'
      pageHeaderAction={
        <div className='flex gap-2'>
          {untriagedCount > 0 && (
            <Link
              href='/dashboard/contacts/triage'
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'text-xs md:text-sm'
              )}
            >
              <IconCards className='mr-2 h-4 w-4' />
              Triage {untriagedCount.toLocaleString()}
            </Link>
          )}
          <LinkedInImportDialog />
          <Link
            href='/dashboard/contacts/new'
            className={cn(buttonVariants(), 'text-xs md:text-sm')}
          >
            <IconPlus className='mr-2 h-4 w-4' /> Add Contact
          </Link>
        </div>
      }
    >
      <Suspense
        fallback={<DataTableSkeleton columnCount={7} rowCount={8} filterCount={2} />}
      >
        <ContactListingPage />
      </Suspense>
    </PageContainer>
  );
}
