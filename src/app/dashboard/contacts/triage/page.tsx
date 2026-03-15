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
    .select({
      howMet: contacts.howMet,
      count: sql<number>`count(*)::int`.as('count')
    })
    .from(contacts)
    .where(
      and(
        sql`${contacts.howMet} IS NOT NULL`,
        ne(contacts.howMet, '')
      )
    )
    .groupBy(contacts.howMet)
    .orderBy(sql`count(*) DESC`);

  const howMetSuggestions = howMetRows
    .filter((r): r is { howMet: string; count: number } => r.howMet !== null)
    .map((r) => ({ value: r.howMet, count: r.count }));

  return (
    <PageContainer scrollable pageTitle='Contact Triage'>
      <TriageWorkflow contacts={untriaged} howMetSuggestions={howMetSuggestions} />
    </PageContainer>
  );
}
