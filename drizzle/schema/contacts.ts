import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import {
  contactRelationshipEnum,
  contactWarmthEnum,
  contactClosenessEnum,
  outreachStatusEnum
} from './enums';
import { companies } from './companies';

export const contacts = pgTable('contacts', {
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

  // Context
  notes: text('notes'),
  tags: text('tags').array(),
  howMet: text('how_met'),
  metDate: timestamp('met_date'),

  // Follow-up tracking
  lastContactDate: timestamp('last_contact_date'),
  nextFollowUpDate: timestamp('next_follow_up_date'),
  followUpNotes: text('follow_up_notes'),

  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at')
});
