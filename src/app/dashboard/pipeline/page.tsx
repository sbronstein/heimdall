import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import {
  pipelineStages,
  applications,
  companies,
  contacts
} from '../../../../drizzle/schema';
import { asc, isNull, eq, sql } from 'drizzle-orm';
import { PipelineViewPage } from '@/features/pipeline/components/pipeline-view-page';
import type { PipelineApplication } from '@/features/pipeline/utils/store';

export const metadata = {
  title: 'Dashboard: Pipeline'
};

export default async function PipelinePage() {
  const stages = await db
    .select()
    .from(pipelineStages)
    .orderBy(asc(pipelineStages.displayOrder));

  const referrer = db.$with('referrer').as(
    db.select({
      id: contacts.id,
      fullName: sql<string>`concat(${contacts.firstName}, ' ', ${contacts.lastName})`.as('full_name')
    }).from(contacts)
  );

  const apps = await db
    .with(referrer)
    .select({
      id: applications.id,
      companyId: applications.companyId,
      companyName: companies.name,
      roleTitle: applications.roleTitle,
      status: applications.status,
      excitementLevel: applications.excitementLevel,
      statusChangedAt: applications.statusChangedAt,
      source: applications.source,
      referredById: applications.referredBy,
      referredByName: referrer.fullName
    })
    .from(applications)
    .leftJoin(companies, eq(applications.companyId, companies.id))
    .leftJoin(referrer, eq(applications.referredBy, referrer.id))
    .where(isNull(applications.archivedAt));

  const pipelineApps: PipelineApplication[] = apps.map((a) => ({
    ...a,
    companyName: a.companyName || 'Unknown',
    statusChangedAt: a.statusChangedAt?.toISOString() || null,
    referredById: a.referredById || null,
    referredByName: a.referredByName || null
  }));

  const allCompanies = await db
    .select()
    .from(companies)
    .where(isNull(companies.archivedAt));

  const allContacts = await db
    .select()
    .from(contacts)
    .where(isNull(contacts.archivedAt));

  return (
    <PageContainer
      scrollable={false}
      pageTitle='Pipeline'
      pageDescription='Track applications through pipeline stages.'
    >
      <PipelineViewPage
        stages={stages}
        applications={pipelineApps}
        companies={allCompanies}
        contacts={allContacts}
      />
    </PageContainer>
  );
}
