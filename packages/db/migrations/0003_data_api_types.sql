-- Postgres enums and citext break under the RDS Data API used on Lambda: it
-- can't return citext values, and it sends parameters as text, which Postgres
-- won't compare with an enum. Store them as text guarded by CHECK constraints.
-- posts_alerts_idx compares against an enum literal, so it is rebuilt by hand.
DROP INDEX "posts_alerts_idx";--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "kind" SET DATA TYPE text USING "kind"::text;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "kind" SET DEFAULT 'UPDATE';--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "severity" SET DATA TYPE text USING "severity"::text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text USING "role"::text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'MEMBER';--> statement-breakpoint
ALTER TABLE "topics" ALTER COLUMN "slug" SET DATA TYPE text USING "slug"::text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "handle" SET DATA TYPE text USING "handle"::text;--> statement-breakpoint
-- citext uniqueness was case-insensitive, so lowercasing can't create duplicates.
UPDATE "users" SET "handle" = lower("handle") WHERE "handle" <> lower("handle");--> statement-breakpoint
UPDATE "topics" SET "slug" = lower("slug") WHERE "slug" <> lower("slug");--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_kind_valid" CHECK ("posts"."kind" in ('UPDATE', 'ALERT', 'ADVISORY'));--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_severity_valid" CHECK ("posts"."severity" in ('INFO', 'ADVISORY', 'WARNING', 'CRITICAL'));--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_slug_lowercase" CHECK ("topics"."slug" = lower("topics"."slug"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_handle_lowercase" CHECK ("users"."handle" = lower("users"."handle"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_valid" CHECK ("users"."role" in ('MEMBER', 'REPORTER', 'OFFICIAL', 'NEWSROOM', 'SUPPORT'));--> statement-breakpoint
CREATE INDEX "posts_alerts_idx" ON "posts" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "posts"."kind" <> 'UPDATE' and "posts"."deleted_at" is null;--> statement-breakpoint
DROP TYPE "public"."alert_severity";--> statement-breakpoint
DROP TYPE "public"."post_kind";--> statement-breakpoint
DROP TYPE "public"."user_role";
