import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index
} from 'drizzle-orm/pg-core';
import {
  companyStageEnum,
  companySizeEnum,
  companyPriorityEnum,
  remotePolicyEnum
} from './enums';

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Core info
    name: text('name').notNull(),
    website: text('website'),
    linkedinUrl: text('linkedin_url'),
    industry: text('industry'),
    description: text('description'),

    // Company profile
    stage: companyStageEnum('stage').default('unknown'),
    size: companySizeEnum('size'),
    employeeCount: integer('employee_count'),
    location: text('location'),
    remotePolicy: remotePolicyEnum('remote_policy').default('unknown'),

    // Funding & financials
    fundingInfo: jsonb('funding_info'),

    // Search-specific
    priority: companyPriorityEnum('priority').default('exploring'),
    tags: text('tags').array(),
    dataMaturity: text('data_maturity'),

    // Key people & org context
    ceoBackground: text('ceo_background'),
    techLeadership: jsonb('tech_leadership'),

    // Research notes
    researchNotes: text('research_notes'),

    // Status tracking
    status: text('status').default('active'),
    passedReason: text('passed_reason'),

    // Metadata
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    archivedAt: timestamp('archived_at')
  },
  (table) => [
    // D-13 #5: ilike prefilter on cross-entity search and companies list filter
    index('companies_name_idx').on(table.name)
  ]
);
