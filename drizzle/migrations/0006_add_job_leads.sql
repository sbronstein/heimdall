CREATE TYPE "public"."job_lead_status" AS ENUM('pending', 'scraping', 'scraped', 'searching', 'found', 'ready', 'actioned', 'archived');--> statement-breakpoint
CREATE TYPE "public"."seniority_level" AS ENUM('c_suite', 'vp', 'director', 'senior_manager', 'manager', 'senior_ic', 'ic', 'entry_level', 'unknown');--> statement-breakpoint
CREATE TABLE "job_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"linkedin_job_url" text NOT NULL,
	"role_title" text,
	"company_name" text,
	"company_id" uuid,
	"application_id" uuid,
	"status" "job_lead_status" DEFAULT 'pending' NOT NULL,
	"scraped_data" jsonb,
	"prospect_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp
);--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_lead_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"seniority_level" "seniority_level" DEFAULT 'unknown' NOT NULL,
	"linkedin_url" text,
	"profile_snippet" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "prospect_bridges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"score" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prospect_bridge_unique" UNIQUE("prospect_id","contact_id")
);--> statement-breakpoint
ALTER TABLE "job_leads" ADD CONSTRAINT "job_leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_leads" ADD CONSTRAINT "job_leads_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_job_lead_id_job_leads_id_fk" FOREIGN KEY ("job_lead_id") REFERENCES "public"."job_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_bridges" ADD CONSTRAINT "prospect_bridges_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_bridges" ADD CONSTRAINT "prospect_bridges_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
