import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { contacts } from '../../../../../drizzle/schema';
import { and, isNull, asc, ne } from 'drizzle-orm';
import { TriageWorkflow } from '@/features/contacts/components/triage/triage-workflow';
import { sql } from 'drizzle-orm';

export const metadata = {
  title: 'Dashboard: Contact Triage'
};

export default async function TriagePage() {
  const untriaged = await db
    .select()
    .from(contacts)
    .where(
      and(
        isNull(contacts.triagedAt),
        isNull(contacts.archivedAt)
      )
    )
    .orderBy(
      sql`${contacts.linkedinConnectionDate} ASC NULLS LAST`,
      asc(contacts.createdAt)
    );

  const howMetRows = await db
    .selectDistinct({ howMet: contacts.howMet })
    .from(contacts)
    .where(
      and(
        sql`${contacts.howMet} IS NOT NULL`,
        ne(contacts.howMet, '')
      )
    )
    .orderBy(asc(contacts.howMet));

  const howMetSuggestions = howMetRows
    .map((r) => r.howMet)
    .filter((v): v is string => v !== null);

  return (
    <PageContainer scrollable pageTitle='Contact Triage'>
      <TriageWorkflow contacts={untriaged} howMetSuggestions={howMetSuggestions} />
    </PageContainer>
  );
}
