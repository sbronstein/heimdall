ALTER TABLE "contacts" ALTER COLUMN "closeness" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "closeness" SET DEFAULT 'acquaintance'::text;--> statement-breakpoint
DROP TYPE "public"."contact_closeness";--> statement-breakpoint
CREATE TYPE "public"."contact_closeness" AS ENUM('close_friend', 'close_colleague', 'friend', 'colleague', 'career_contact', 'acquaintance', 'linkedin_only', 'never_met');--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "closeness" SET DEFAULT 'acquaintance'::"public"."contact_closeness";--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "closeness" SET DATA TYPE "public"."contact_closeness" USING "closeness"::"public"."contact_closeness";