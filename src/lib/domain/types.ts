import type {
  companies,
  contacts,
  applications,
  interactions,
  tasks,
  notes,
  timelineEvents,
  pipelineStages,
  recruiters,
  searchMetrics
} from '../../../drizzle/schema';

// Inferred select types (what you get back from queries)
export type Company = typeof companies.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type Interaction = typeof interactions.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type TimelineEvent = typeof timelineEvents.$inferSelect;
export type PipelineStage = typeof pipelineStages.$inferSelect;
export type Recruiter = typeof recruiters.$inferSelect;
export type SearchMetric = typeof searchMetrics.$inferSelect;

// Inferred insert types (what you pass to create)
export type NewCompany = typeof companies.$inferInsert;
export type NewContact = typeof contacts.$inferInsert;
export type NewApplication = typeof applications.$inferInsert;
export type NewInteraction = typeof interactions.$inferInsert;
export type NewTask = typeof tasks.$inferInsert;
export type NewNote = typeof notes.$inferInsert;
export type NewTimelineEvent = typeof timelineEvents.$inferInsert;
export type NewPipelineStage = typeof pipelineStages.$inferInsert;
export type NewRecruiter = typeof recruiters.$inferInsert;
export type NewSearchMetric = typeof searchMetrics.$inferInsert;

// Enum value arrays for zod schemas and filter options
export const companyStageValues = [
  'seed',
  'series_a',
  'series_b',
  'series_c',
  'series_d_plus',
  'growth',
  'public',
  'bootstrapped',
  'unknown'
] as const;

export const companySizeValues = [
  '1_10',
  '11_50',
  '51_100',
  '101_250',
  '251_500',
  '501_1000',
  '1001_5000',
  '5001_plus'
] as const;

export const companyPriorityValues = [
  'dream',
  'strong',
  'interested',
  'exploring',
  'backburner'
] as const;

export const remotePolicyValues = [
  'remote',
  'hybrid',
  'onsite',
  'flexible',
  'unknown'
] as const;

export const applicationStatusValues = [
  'researching',
  'applied',
  'recruiter_screen',
  'phone_interview',
  'onsite',
  'final_round',
  'offer',
  'negotiating',
  'accepted',
  'rejected',
  'withdrawn',
  'ghosted',
  'on_hold'
] as const;

export const applicationSourceValues = [
  'referral',
  'recruiter_inbound',
  'recruiter_outbound',
  'linkedin',
  'job_board',
  'vc_talent_network',
  'direct_application',
  'networking',
  'conference',
  'other'
] as const;

export const excitementLevelValues = [
  '5_dream_role',
  '4_very_excited',
  '3_interested',
  '2_lukewarm',
  '1_not_interested'
] as const;

export const contactRelationshipValues = [
  'recruiter_internal',
  'recruiter_external',
  'hiring_manager',
  'peer',
  'executive',
  'board_member',
  'investor',
  'former_colleague',
  'friend',
  'cold_contact',
  'other'
] as const;

export const contactWarmthValues = [
  'hot',
  'warm',
  'lukewarm',
  'cold'
] as const;

export const interactionTypeValues = [
  'email_sent',
  'email_received',
  'linkedin_message_sent',
  'linkedin_message_received',
  'phone_call',
  'video_call',
  'coffee_chat',
  'interview',
  'follow_up',
  'thank_you',
  'intro_requested',
  'intro_made',
  'referral_given',
  'informational',
  'other'
] as const;

export const interactionSentimentValues = [
  'very_positive',
  'positive',
  'neutral',
  'negative',
  'very_negative'
] as const;

export const taskStatusValues = [
  'todo',
  'in_progress',
  'waiting',
  'done',
  'cancelled'
] as const;

export const taskPriorityValues = [
  'urgent',
  'high',
  'medium',
  'low'
] as const;

export const contactClosenessValues = [
  'close_friend',
  'close_colleague',
  'friend',
  'colleague',
  'career_contact',
  'acquaintance',
  'linkedin_only',
  'never_met'
] as const;

export const outreachStatusValues = [
  'not_reached_out',
  'reached_out',
  'meeting_scheduled',
  'meeting_completed',
  'ongoing'
] as const;
