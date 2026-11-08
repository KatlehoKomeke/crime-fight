-- Claims now reach CIVIC/ONE first: SUBMITTED → APPROVED (the poster sees it) → CONFIRMED or DISPUTED (the poster objected) → VERIFIED → PAID.
-- A poster can no longer reject a claim, so REJECTED_BY_POSTER goes; the rows below are moved onto the new states first.
ALTER TABLE "bounty_claims" DROP CONSTRAINT "bounty_claims_status_valid";--> statement-breakpoint
ALTER TABLE "bounty_events" DROP CONSTRAINT "bounty_events_kind_valid";--> statement-breakpoint
DROP INDEX "bounty_claims_one_live_idx";--> statement-breakpoint
DROP INDEX "bounty_claims_one_winner_idx";--> statement-breakpoint
ALTER TABLE "bounty_claims" ADD COLUMN "approved_at" timestamp (3) with time zone;--> statement-breakpoint
-- A poster's rejection becomes a rejection; a disputed claim that isn't the bounty's winner goes back to CIVIC/ONE to check.
UPDATE "bounty_claims" SET "status" = 'REJECTED' WHERE "status" = 'REJECTED_BY_POSTER';--> statement-breakpoint
UPDATE "bounty_claims" c SET "status" = 'SUBMITTED', "dispute_note" = NULL, "disputed_at" = NULL
WHERE c."status" = 'DISPUTED' AND NOT EXISTS (SELECT 1 FROM "bounties" b WHERE b."winning_claim_id" = c."id");--> statement-breakpoint
-- Claims the poster already saw under the old order count as approved, so the poster keeps seeing them.
UPDATE "bounty_claims" SET "approved_at" = coalesce("confirmed_at", "disputed_at", "created_at")
WHERE "status" IN ('CONFIRMED', 'DISPUTED', 'VERIFIED', 'PAID') OR ("status" = 'REJECTED' AND "confirmed_at" IS NOT NULL);--> statement-breakpoint
UPDATE "bounty_events" SET "kind" = 'CLAIM_REJECTED' WHERE "kind" = 'CLAIM_REJECTED_BY_POSTER';--> statement-breakpoint
CREATE UNIQUE INDEX "bounty_claims_one_live_idx" ON "bounty_claims" USING btree ("bounty_id","claimant_id") WHERE "bounty_claims"."status" in ('SUBMITTED', 'APPROVED', 'CONFIRMED', 'DISPUTED', 'VERIFIED', 'PAID');--> statement-breakpoint
CREATE UNIQUE INDEX "bounty_claims_one_winner_idx" ON "bounty_claims" USING btree ("bounty_id") WHERE "bounty_claims"."status" in ('APPROVED', 'CONFIRMED', 'DISPUTED', 'VERIFIED', 'PAID');--> statement-breakpoint
ALTER TABLE "bounty_claims" ADD CONSTRAINT "bounty_claims_status_valid" CHECK ("bounty_claims"."status" in ('SUBMITTED', 'APPROVED', 'CONFIRMED', 'DISPUTED', 'VERIFIED', 'PAID', 'REJECTED', 'WITHDRAWN'));--> statement-breakpoint
ALTER TABLE "bounty_events" ADD CONSTRAINT "bounty_events_kind_valid" CHECK ("bounty_events"."kind" in ('CREATED', 'FUNDED', 'APPROVED', 'DECLINED', 'CLAIM_SUBMITTED', 'CLAIM_WITHDRAWN', 'CLAIM_APPROVED', 'CLAIM_CONFIRMED', 'CLAIM_DISPUTED', 'CLAIM_ESCALATED', 'CLAIM_VERIFIED', 'CLAIM_REJECTED', 'PAYOUT_SENT', 'PAYOUT_FAILED', 'PAID', 'CANCEL_REQUESTED', 'CANCELLED', 'EXPIRING', 'EXPIRED', 'REFUNDED', 'REFUND_FAILED', 'FROZEN', 'UNFROZEN', 'REPORTED', 'CHARGEBACK', 'REVIEW_NEEDED'));
