ALTER TYPE "public"."job_lead_status" ADD VALUE IF NOT EXISTS 'queued' BEFORE 'searching';--> statement-breakpoint
ALTER TYPE "public"."job_lead_status" ADD VALUE IF NOT EXISTS 'failed';--> statement-breakpoint
ALTER TABLE "job_leads" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "job_leads" ADD COLUMN "last_error_at" timestamp with time zone;
