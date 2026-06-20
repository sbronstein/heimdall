import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { outreachCampaignStatusEnum } from './enums';

export const outreachCampaigns = pgTable('outreach_campaigns', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  goalInstruction: text('goal_instruction').notNull(),
  status: outreachCampaignStatusEnum('status').default('draft').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at') // soft delete — never hard delete
});
