import { pgEnum } from 'drizzle-orm/pg-core';

export const companyStageEnum = pgEnum('company_stage', [
  'seed',
  'series_a',
  'series_b',
  'series_c',
  'series_d_plus',
  'growth',
  'public',
  'bootstrapped',
  'unknown'
]);

export const companySizeEnum = pgEnum('company_size', [
  '1_10',
  '11_50',
  '51_100',
  '101_250',
  '251_500',
  '501_1000',
  '1001_5000',
  '5001_plus'
]);

export const companyPriorityEnum = pgEnum('company_priority', [
  'dream',
  'strong',
  'interested',
  'exploring',
  'backburner'
]);

export const remotePolicyEnum = pgEnum('remote_policy', [
  'remote',
  'hybrid',
  'onsite',
  'flexible',
  'unknown'
]);

export const applicationStatusEnum = pgEnum('application_status', [
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
]);

export const applicationSourceEnum = pgEnum('application_source', [
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
]);

export const contactRelationshipEnum = pgEnum('contact_relationship', [
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
]);

export const contactWarmthEnum = pgEnum('contact_warmth', [
  'hot',
  'warm',
  'lukewarm',
  'cold'
]);

export const interactionTypeEnum = pgEnum('interaction_type', [
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
]);

export const interactionSentimentEnum = pgEnum('interaction_sentiment', [
  'very_positive',
  'positive',
  'neutral',
  'negative',
  'very_negative'
]);

export const taskStatusEnum = pgEnum('task_status', [
  'todo',
  'in_progress',
  'waiting',
  'done',
  'cancelled'
]);

export const taskPriorityEnum = pgEnum('task_priority', [
  'urgent',
  'high',
  'medium',
  'low'
]);

export const contactClosenessEnum = pgEnum('contact_closeness', [
  'close_friend',
  'close_colleague',
  'friend',
  'colleague',
  'career_contact',
  'acquaintance',
  'linkedin_only',
  'never_met'
]);

export const outreachStatusEnum = pgEnum('outreach_status', [
  'not_reached_out',
  'reached_out',
  'meeting_scheduled',
  'meeting_completed',
  'ongoing'
]);

export const excitementLevelEnum = pgEnum('excitement_level', [
  '5_dream_role',
  '4_very_excited',
  '3_interested',
  '2_lukewarm',
  '1_not_interested'
]);

export const jobLeadStatusEnum = pgEnum('job_lead_status', [
  'pending',
  'scraping',
  'scraped',
  'queued',
  'searching',
  'found',
  'ready',
  'actioned',
  'archived',
  'failed'
]);

export const seniorityLevelEnum = pgEnum('seniority_level', [
  'c_suite',
  'vp',
  'director',
  'senior_manager',
  'manager',
  'senior_ic',
  'ic',
  'entry_level',
  'unknown'
]);
