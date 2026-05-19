import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  unique
} from 'drizzle-orm/pg-core';
import { jobLeadStatusEnum, seniorityLevelEnum } from './enums';
import { companies } from './companies';
import { applications } from './applications';
import { contacts } from './contacts';

export const jobLeads = pgTable('job_leads', {
  id: uuid('id').defaultRandom().primaryKey(),

  // Core
  linkedinJobUrl: text('linkedin_job_url'),
  roleTitle: text('role_title'),
  companyName: text('company_name'),

  // Links
  companyId: uuid('company_id').references(() => companies.id),
  applicationId: uuid('application_id').references(() => applications.id),

  // Status
  status: jobLeadStatusEnum('status').default('pending').notNull(),

  // Scraped data
  scrapedData: jsonb('scraped_data'),

  // Stats
  prospectCount: integer('prospect_count').default(0).notNull(),

  // Error tracking (D-07)
  lastError: text('last_error'),
  lastErrorAt: timestamp('last_error_at', { withTimezone: true }),

  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at')
});

export const prospects = pgTable('prospects', {
  id: uuid('id').defaultRandom().primaryKey(),

  // Parent
  jobLeadId: uuid('job_lead_id')
    .references(() => jobLeads.id)
    .notNull(),

  // Profile
  name: text('name').notNull(),
  title: text('title'),
  seniorityLevel: seniorityLevelEnum('seniority_level').default('unknown').notNull(),
  linkedinUrl: text('linkedin_url'),
  profileSnippet: text('profile_snippet'),

  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const prospectBridges = pgTable(
  'prospect_bridges',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Links
    prospectId: uuid('prospect_id')
      .references(() => prospects.id)
      .notNull(),
    contactId: uuid('contact_id')
      .references(() => contacts.id)
      .notNull(),

    // Score
    score: integer('score'),

    // Metadata
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [unique('prospect_bridge_unique').on(table.prospectId, table.contactId)]
);
