import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
  index
} from 'drizzle-orm/pg-core';
import { outreachChannelEnum, outreachEmailStatusEnum } from './enums';
import { outreachCampaigns } from './outreach-campaigns';
import { contacts } from './contacts';

export const outreachEmails = pgTable(
  'outreach_emails',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Links
    campaignId: uuid('campaign_id')
      .references(() => outreachCampaigns.id)
      .notNull(),
    contactId: uuid('contact_id')
      .references(() => contacts.id)
      .notNull(),

    // Channel (D-07) — "needs LinkedIn" is a channel, not a status
    channel: outreachChannelEnum('channel').default('email').notNull(),
    recipientEmail: text('recipient_email'),

    // Generated vs edited content (D-09) — final = editedX ?? generatedX
    generatedSubject: text('generated_subject'),
    generatedBody: text('generated_body'),
    editedSubject: text('edited_subject'),
    editedBody: text('edited_body'),

    // Status (state machine guarded — D-01..D-06)
    status: outreachEmailStatusEnum('status').default('pending').notNull(),

    // Gmail draft linkage (Phase 17)
    gmailDraftId: text('gmail_draft_id'),

    // Failure tracking (CD-01 — mirror job-leads.ts:36-38)
    lastError: text('last_error'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),

    // Lifecycle timestamps (CD-02 — set by Phase 12 routes on transition)
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    draftedAt: timestamp('drafted_at', { withTimezone: true }),

    // Metadata
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    unique('outreach_emails_campaign_contact_unique').on(
      table.campaignId,
      table.contactId
    ),
    index('outreach_emails_campaign_id_idx').on(table.campaignId),
    index('outreach_emails_status_idx').on(table.status),
    index('outreach_emails_contact_id_idx').on(table.contactId)
  ]
);
