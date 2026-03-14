import PageContainer from '@/components/layout/page-container';
import { buttonVariants } from '@/components/ui/button';
import { DataTableSkeleton } from '@/components/ui/table/data-table-skeleton';
import ContactListingPage from '@/features/contacts/components/contact-listing';
import { LinkedInImportDialog } from '@/features/contacts/components/linkedin-import/linkedin-import-dialog';
import { cn } from '@/lib/utils';
import { IconPlus } from '@tabler/icons-react';
import Link from 'next/link';
import { Suspense } from 'react';

export const metadata = {
  title: 'Dashboard: Contacts'
};

export default function ContactsPage() {
  return (
    <PageContainer
      scrollable={false}
      pageTitle='Contacts'
      pageDescription='Manage your network of recruiters, hiring managers, and connections.'
      pageHeaderAction={
        <div className='flex gap-2'>
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
