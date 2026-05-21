ALTER TABLE "contacts" ALTER COLUMN "closeness" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."contact_closeness" RENAME TO "contact_closeness_old";--> statement-breakpoint
CREATE TYPE "public"."contact_closeness" AS ENUM('close_friend', 'close_colleague', 'friend', 'colleague', 'close_career', 'career', 'acquaintance', 'linkedin_only', 'never_met');--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "closeness" TYPE "public"."contact_closeness" USING (CASE WHEN "closeness"::text = 'career_contact' THEN 'career' ELSE "closeness"::text END)::"public"."contact_closeness";--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "closeness" SET DEFAULT 'acquaintance';--> statement-breakpoint
DROP TYPE "public"."contact_closeness_old";
