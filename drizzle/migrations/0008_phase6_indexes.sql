CREATE INDEX "companies_name_idx" ON "companies" USING btree ("name");--> statement-breakpoint
CREATE INDEX "contacts_archived_at_idx" ON "contacts" USING btree ("archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_linkedin_url_unique_idx" ON "contacts" USING btree ("linkedin_url") WHERE "contacts"."linkedin_url" IS NOT NULL AND "contacts"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "contacts_company_id_idx" ON "contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "contacts_linkedin_connection_date_idx" ON "contacts" USING btree ("linkedin_connection_date");