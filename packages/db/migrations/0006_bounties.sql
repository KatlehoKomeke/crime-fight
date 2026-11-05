CREATE TABLE "bounties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poster_id" uuid,
	"post_id" uuid,
	"kind" text NOT NULL,
	"status" text DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"frozen_from_status" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"area" text,
	"saps_case_number" text,
	"relationship" text,
	"amount_cents" integer NOT NULL,
	"platform_fee_cents" integer DEFAULT 0 NOT NULL,
	"vat_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"deposited_cents" integer DEFAULT 0 NOT NULL,
	"released_cents" integer DEFAULT 0 NOT NULL,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"duration_days" integer NOT NULL,
	"payer_email" text,
	"terms_accepted_at" timestamp (3) with time zone NOT NULL,
	"funded_at" timestamp (3) with time zone,
	"expires_at" timestamp (3) with time zone,
	"expiring_notified_at" timestamp (3) with time zone,
	"closed_at" timestamp (3) with time zone,
	"winning_claim_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bounties_kind_valid" CHECK ("bounties"."kind" in ('PROPERTY', 'MISSING_PERSON', 'INFORMATION')),
	CONSTRAINT "bounties_status_valid" CHECK ("bounties"."status" in ('PENDING_PAYMENT', 'PENDING_REVIEW', 'OPEN', 'AWAITING_VERIFICATION', 'RELEASING', 'PAID', 'CANCELLED', 'EXPIRED', 'ABANDONED', 'FROZEN')),
	CONSTRAINT "bounties_frozen_from_valid" CHECK ("bounties"."frozen_from_status" in ('PENDING_PAYMENT', 'PENDING_REVIEW', 'OPEN', 'AWAITING_VERIFICATION', 'RELEASING', 'PAID', 'CANCELLED', 'EXPIRED', 'ABANDONED', 'FROZEN')),
	CONSTRAINT "bounties_amount_positive" CHECK ("bounties"."amount_cents" > 0),
	CONSTRAINT "bounties_money_balanced" CHECK ("bounties"."released_cents" + "bounties"."refunded_cents" <= "bounties"."deposited_cents")
);
--> statement-breakpoint
CREATE TABLE "bounty_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bounty_id" uuid NOT NULL,
	"claimant_id" uuid,
	"status" text DEFAULT 'SUBMITTED' NOT NULL,
	"body" text NOT NULL,
	"links" text DEFAULT '' NOT NULL,
	"poster_note" text,
	"dispute_note" text,
	"decision_reason" text,
	"decision_note" text,
	"decided_by_id" uuid,
	"preflight" text,
	"attested_at" timestamp (3) with time zone NOT NULL,
	"confirmed_at" timestamp (3) with time zone,
	"cooldown_until" timestamp (3) with time zone,
	"rejected_at" timestamp (3) with time zone,
	"disputed_at" timestamp (3) with time zone,
	"decided_at" timestamp (3) with time zone,
	"payout_account_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bounty_claims_status_valid" CHECK ("bounty_claims"."status" in ('SUBMITTED', 'CONFIRMED', 'REJECTED_BY_POSTER', 'DISPUTED', 'VERIFIED', 'PAID', 'REJECTED', 'WITHDRAWN')),
	CONSTRAINT "bounty_claims_reason_valid" CHECK ("bounty_claims"."decision_reason" in ('VERIFIED', 'NOT_ENOUGH_EVIDENCE', 'OUTCOME_NOT_MET', 'INVOLVED', 'NOT_VIA_SAPS', 'DUPLICATE', 'SAFETY', 'TERMS_BREACH', 'LEGAL_HOLD', 'OTHER_CLAIM_PAID', 'BOUNTY_CLOSED', 'ADMIN_OVERRIDE'))
);
--> statement-breakpoint
CREATE TABLE "bounty_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bounty_id" uuid NOT NULL,
	"claim_id" uuid,
	"kind" text NOT NULL,
	"actor_id" uuid,
	"by_admin" boolean DEFAULT false NOT NULL,
	"recipient_id" uuid,
	"is_public" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bounty_events_kind_valid" CHECK ("bounty_events"."kind" in ('CREATED', 'FUNDED', 'APPROVED', 'DECLINED', 'CLAIM_SUBMITTED', 'CLAIM_WITHDRAWN', 'CLAIM_CONFIRMED', 'CLAIM_REJECTED_BY_POSTER', 'CLAIM_DISPUTED', 'CLAIM_ESCALATED', 'CLAIM_VERIFIED', 'CLAIM_REJECTED', 'PAYOUT_SENT', 'PAYOUT_FAILED', 'PAID', 'CANCEL_REQUESTED', 'CANCELLED', 'EXPIRING', 'EXPIRED', 'REFUNDED', 'REFUND_FAILED', 'FROZEN', 'UNFROZEN', 'REPORTED', 'CHARGEBACK'))
);
--> statement-breakpoint
CREATE TABLE "bounty_reports" (
	"bounty_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bounty_reports_bounty_id_reporter_id_pk" PRIMARY KEY("bounty_id","reporter_id"),
	CONSTRAINT "bounty_reports_reason_valid" CHECK ("bounty_reports"."reason" in ('TARGETS_A_PERSON', 'NOT_MISSING', 'SCAM', 'PERSONAL_INFORMATION', 'OTHER'))
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bounty_id" uuid NOT NULL,
	"claim_id" uuid,
	"user_id" uuid,
	"type" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"provider" text NOT NULL,
	"reference" text NOT NULL,
	"provider_ref" text,
	"provider_fee_cents" integer,
	"idempotency_key" text NOT NULL,
	"note" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp (3) with time zone,
	CONSTRAINT "ledger_entries_reference_unique" UNIQUE("reference"),
	CONSTRAINT "ledger_entries_idempotencyKey_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "ledger_type_valid" CHECK ("ledger_entries"."type" in ('DEPOSIT', 'RELEASE', 'REFUND', 'REVERSAL', 'CHARGEBACK', 'CHARGEBACK_REVERSED')),
	CONSTRAINT "ledger_status_valid" CHECK ("ledger_entries"."status" in ('PENDING', 'SETTLED', 'FAILED', 'MISMATCH')),
	CONSTRAINT "ledger_amount_positive" CHECK ("ledger_entries"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"reference" text,
	"outcome" text DEFAULT 'RECEIVED' NOT NULL,
	"payload" text NOT NULL,
	"received_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"provider" text NOT NULL,
	"recipient_code" text NOT NULL,
	"bank_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_name" text NOT NULL,
	"account_last4" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"replaced_at" timestamp (3) with time zone,
	CONSTRAINT "payout_accounts_status_valid" CHECK ("payout_accounts"."status" in ('ACTIVE', 'REPLACED'))
);
--> statement-breakpoint
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_poster_id_users_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounty_claims" ADD CONSTRAINT "bounty_claims_bounty_id_bounties_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounty_claims" ADD CONSTRAINT "bounty_claims_claimant_id_users_id_fk" FOREIGN KEY ("claimant_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounty_claims" ADD CONSTRAINT "bounty_claims_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounty_events" ADD CONSTRAINT "bounty_events_bounty_id_bounties_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounty_events" ADD CONSTRAINT "bounty_events_claim_id_bounty_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."bounty_claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounty_events" ADD CONSTRAINT "bounty_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounty_events" ADD CONSTRAINT "bounty_events_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounty_reports" ADD CONSTRAINT "bounty_reports_bounty_id_bounties_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounty_reports" ADD CONSTRAINT "bounty_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_bounty_id_bounties_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_claim_id_bounty_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."bounty_claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bounties_board_idx" ON "bounties" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "bounties"."status" in ('OPEN', 'AWAITING_VERIFICATION', 'RELEASING', 'PAID');--> statement-breakpoint
CREATE INDEX "bounties_poster_idx" ON "bounties" USING btree ("poster_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bounties_post_idx" ON "bounties" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "bounties_status_idx" ON "bounties" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "bounty_claims_bounty_idx" ON "bounty_claims" USING btree ("bounty_id","created_at");--> statement-breakpoint
CREATE INDEX "bounty_claims_claimant_idx" ON "bounty_claims" USING btree ("claimant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "bounty_claims_one_live_idx" ON "bounty_claims" USING btree ("bounty_id","claimant_id") WHERE "bounty_claims"."status" in ('SUBMITTED', 'CONFIRMED', 'REJECTED_BY_POSTER', 'DISPUTED', 'VERIFIED', 'PAID');--> statement-breakpoint
CREATE UNIQUE INDEX "bounty_claims_one_winner_idx" ON "bounty_claims" USING btree ("bounty_id") WHERE "bounty_claims"."status" in ('CONFIRMED', 'VERIFIED', 'PAID');--> statement-breakpoint
CREATE INDEX "bounty_events_bounty_idx" ON "bounty_events" USING btree ("bounty_id","created_at");--> statement-breakpoint
CREATE INDEX "bounty_events_recipient_idx" ON "bounty_events" USING btree ("recipient_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ledger_bounty_idx" ON "ledger_entries" USING btree ("bounty_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_pending_idx" ON "ledger_entries" USING btree ("status","created_at") WHERE "ledger_entries"."status" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_one_release_idx" ON "ledger_entries" USING btree ("bounty_id") WHERE "ledger_entries"."type" = 'RELEASE' and "ledger_entries"."status" in ('PENDING', 'SETTLED');--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_one_live_deposit_idx" ON "ledger_entries" USING btree ("bounty_id") WHERE "ledger_entries"."type" = 'DEPOSIT' and "ledger_entries"."status" in ('PENDING', 'SETTLED');--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_key_idx" ON "payment_events" USING btree ("provider","event_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_accounts_one_active_idx" ON "payout_accounts" USING btree ("user_id") WHERE "payout_accounts"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "payout_accounts_fingerprint_idx" ON "payout_accounts" USING btree ("fingerprint") WHERE "payout_accounts"."status" = 'ACTIVE';--> statement-breakpoint
-- Money rows are a record: they may settle or fail, but never vanish or change what they were for.
CREATE FUNCTION ledger_entries_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ledger entries cannot be deleted';
  END IF;
  IF NEW.amount_cents <> OLD.amount_cents OR NEW.type <> OLD.type OR NEW.bounty_id <> OLD.bounty_id
     OR NEW.reference <> OLD.reference OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.currency <> OLD.currency THEN
    RAISE EXCEPTION 'ledger entries cannot be changed';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON "ledger_entries" FOR EACH ROW EXECUTE FUNCTION ledger_entries_immutable();
