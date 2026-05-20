CREATE TYPE "public"."contact_enrichment_status" AS ENUM('unenriched', 'pending', 'enriched', 'failed');--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "company_at_connection" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "role_at_connection" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "enrichment_status" "contact_enrichment_status" DEFAULT 'unenriched';--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "enriched_at" timestamp;--> statement-breakpoint
CREATE INDEX "contacts_enrichment_status_idx" ON "contacts" USING btree ("enrichment_status");