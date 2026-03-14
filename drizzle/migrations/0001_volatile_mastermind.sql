CREATE TYPE "public"."contact_closeness" AS ENUM('friend', 'close_colleague', 'colleague', 'acquaintance', 'linkedin_only', 'never_met');--> statement-breakpoint
CREATE TYPE "public"."outreach_status" AS ENUM('not_reached_out', 'reached_out', 'meeting_scheduled', 'meeting_completed', 'ongoing');--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "closeness" "contact_closeness" DEFAULT 'acquaintance';--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "outreach_status" "outreach_status" DEFAULT 'not_reached_out';--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "outreach_date" timestamp;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "linkedin_connection_date" timestamp;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "import_source" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "imported_at" timestamp;