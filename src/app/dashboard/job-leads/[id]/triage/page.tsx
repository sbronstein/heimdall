import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { contacts, prospectBridges, prospects } from '../../../../../../drizzle/schema';
import { eq, isNull, and, inArray, asc, ne } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { TriageWorkflow } from '@/features/contacts/components/triage/triage-workflow';

export const metadata = {
  title: 'Dashboard: Triage Mutual Connections'
};

export default async function JobLeadTriagePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Get contact IDs from prospect bridges for this job lead
  const bridges = await db
    .select({ contactId: prospectBridges.contactId })
    .from(prospectBridges)
    .innerJoin(prospects, eq(prospectBridges.prospectId, prospects.id))
    .where(eq(prospects.jobLeadId, id));

  const contactIds = Array.from(new Set(bridges.map((b) => b.contactId)));

  // Get untriaged contacts from those IDs
  const untriaged =
    contactIds.length > 0
      ? await db
          .select()
          .from(contacts)
          .where(
            and(
              inArray(contacts.id, contactIds),
              isNull(contacts.triagedAt),
              isNull(contacts.archivedAt)
            )
          )
          .orderBy(asc(contacts.createdAt))
      : [];

  // Fetch howMet suggestions (reuse same logic as contacts triage)
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
    <PageContainer scrollable pageTitle='Triage Mutual Connections'>
      <TriageWorkflow
        contacts={untriaged}
        howMetSuggestions={howMetSuggestions}
        exitUrl={`/dashboard/job-leads/${id}`}
      />
    </PageContainer>
  );
}
