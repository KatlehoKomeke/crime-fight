DROP INDEX "payout_accounts_fingerprint_idx";--> statement-breakpoint
ALTER TABLE "bounties" ADD COLUMN "listed_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "bounties" ADD COLUMN "removed_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "bounty_claims" ADD COLUMN "confirm_note" text;--> statement-breakpoint
CREATE UNIQUE INDEX "payout_accounts_fingerprint_idx" ON "payout_accounts" USING btree ("fingerprint");--> statement-breakpoint
-- Bounties that were on the board before listed_at existed: every listed status, a hold taken from one,
-- and closed ones that were funded without needing review or that an admin approved.
UPDATE "bounties" SET "listed_at" = coalesce("funded_at", "created_at")
WHERE "listed_at" IS NULL AND (
  "status" IN ('OPEN', 'AWAITING_VERIFICATION', 'RELEASING', 'PAID')
  OR ("status" = 'FROZEN' AND "frozen_from_status" IN ('OPEN', 'AWAITING_VERIFICATION'))
  OR ("status" IN ('CANCELLED', 'EXPIRED') AND "funded_at" IS NOT NULL AND "kind" <> 'MISSING_PERSON')
  OR ("status" IN ('CANCELLED', 'EXPIRED') AND EXISTS (SELECT 1 FROM "bounty_events" e WHERE e."bounty_id" = "bounties"."id" AND e."kind" = 'APPROVED'))
);
