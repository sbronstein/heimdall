CREATE TYPE "public"."outreach_campaign_status" AS ENUM('draft', 'active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."outreach_channel" AS ENUM('email', 'linkedin_message');--> statement-breakpoint
CREATE TYPE "public"."outreach_email_status" AS ENUM('pending', 'generated', 'edited', 'approved', 'drafted', 'failed');--> statement-breakpoint
CREATE TABLE "outreach_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"goal_instruction" text NOT NULL,
	"status" "outreach_campaign_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "outreach_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" "outreach_channel" DEFAULT 'email' NOT NULL,
	"recipient_email" text,
	"generated_subject" text,
	"generated_body" text,
	"edited_subject" text,
	"edited_body" text,
	"status" "outreach_email_status" DEFAULT 'pending' NOT NULL,
	"gmail_draft_id" text,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"generated_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"drafted_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_emails_campaign_contact_unique" UNIQUE("campaign_id","contact_id")
);
--> statement-breakpoint
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_campaign_id_outreach_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."outreach_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outreach_emails_campaign_id_idx" ON "outreach_emails" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "outreach_emails_status_idx" ON "outreach_emails" USING btree ("status");--> statement-breakpoint
CREATE INDEX "outreach_emails_contact_id_idx" ON "outreach_emails" USING btree ("contact_id");