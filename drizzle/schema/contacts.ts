import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  contactRelationshipEnum,
  contactWarmthEnum,
  contactClosenessEnum,
  outreachStatusEnum,
  contactEnrichmentStatusEnum
} from './enums';
import { companies } from './companies';

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Core info
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    linkedinUrl: text('linkedin_url'),
    title: text('title'),
    currentCompany: text('current_company'),

    // Relationship to your search
    companyId: uuid('company_id').references(() => companies.id),
    relationship: contactRelationshipEnum('relationship').default('other'),
    warmth: contactWarmthEnum('warmth').default('cold'),
    closeness: contactClosenessEnum('closeness').default('acquaintance'),
    outreachStatus: outreachStatusEnum('outreach_status').default('not_reached_out'),
    outreachDate: timestamp('outreach_date'),
    introducedBy: uuid('introduced_by'),

    // Import tracking
    linkedinConnectionDate: timestamp('linkedin_connection_date'),
    importSource: text('import_source'),
    importedAt: timestamp('imported_at'),
    companyAtConnection: text('company_at_connection'),
    roleAtConnection: text('role_at_connection'),

    // Enrichment tracking
    enrichmentStatus: contactEnrichmentStatusEnum('enrichment_status').default('unenriched'),
    enrichedAt: timestamp('enriched_at'),

    // Context
    notes: text('notes'),
    tags: text('tags').array(),
    howMet: text('how_met'),
    metDate: timestamp('met_date'),

    // Follow-up tracking
    lastContactDate: timestamp('last_contact_date'),
    nextFollowUpDate: timestamp('next_follow_up_date'),
    followUpNotes: text('follow_up_notes'),

    // Triage
    triagedAt: timestamp('triaged_at'),

    // Metadata
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    archivedAt: timestamp('archived_at')
  },
  (table) => [
    // D-13 #1: ubiquitous WHERE archived_at IS NULL filter
    index('contacts_archived_at_idx').on(table.archivedAt),
    // D-13 #2: partial UNIQUE for D-08 ON CONFLICT DO NOTHING; scoped to ACTIVE rows only so
    // re-importing a previously-archived linkedin_url creates a fresh active row (CONTEXT §Out of scope invariant)
    uniqueIndex('contacts_linkedin_url_unique_idx')
      .on(table.linkedinUrl)
      .where(sql`${table.linkedinUrl} IS NOT NULL AND ${table.archivedAt} IS NULL`),
    // D-13 #3: JOIN key from companies and /api/companies/[id]/contacts filter
    index('contacts_company_id_idx').on(table.companyId),
    // D-13 #4: triage-page ordering
    index('contacts_linkedin_connection_date_idx').on(table.linkedinConnectionDate),
    // Phase 10: batch-sweep predicate — select unenriched active rows
    index('contacts_enrichment_status_idx').on(table.enrichmentStatus)
  ]
);
