# ADR 0006 — Bounties: a provider-agnostic ledger, dual control, and Paystack behind an interface

- **Status:** Accepted (November 2026). Payments stay `disabled` in production until [the go-live gate](#the-go-live-gate) below is cleared; the board is read-only until then.

## Goal

A member who suffered a crime posts a reward (R200–R50 000) for a verifiable outcome: a stolen vehicle or item recovered through SAPS, a missing person found safe, or information handed to SAPS. They pay the reward in up front, CIVIC/ONE holds it, and it is paid to the claimant only after the poster confirms a claim *and* an administrator verifies it after a cooling-off period; otherwise it goes back to the poster. Money must be impossible to lose, double-pay or move without a record; the payment provider must be swappable, because whether CIVIC/ONE may hold other people's money at all is a legal question that isn't settled; and nothing may move real money until it is.

## Product rules

| Rule | Why |
| --- | --- |
| **Paid in up front and held.** A bounty isn't listed until its deposit settles; the board shows only funded bounties. Nothing is spent, lent or invested. | An unfunded promise is the fraud the feature exists to prevent. A claimant can see the money exists before they do anything. |
| **Nobody is named.** Bounty text can't contain an `@mention`; a bounty describes a vehicle, an item, a missing person or a case, never a suspect. ID and card numbers are refused outright, and a missing-person bounty can't carry a street address. Claims are private to the claimant, the poster and admins; the public sees the count and an activity trail that says a claim came in, never from whom. | A reward for a person is a vigilante bounty. CIVIC/ONE pays for outcomes SAPS can confirm. The deterministic rules fail fast with a message the form shows; judgement calls go through reports and review. |
| **Property comes back through SAPS.** A claim attests the claimant wasn't involved and didn't buy the item back. | Buying back stolen goods is itself an offence (receiving stolen property) and funds the next theft. |
| **Information goes to SAPS first.** The evidence is the station and officer spoken to, never the information itself, and the cooling-off is seven days instead of three. | Withholding information until paid can be a crime; CIVIC/ONE must never be where a tip-off is traded. An arrest or charge takes longer to confirm than a returned bakkie. |
| **Dual control.** The poster confirms a claim; an administrator verifies it after the kind's cooling-off (72 h for property and missing persons, 7 days for information), with a written note, and only then is the transfer sent. A claim the poster rejects can be disputed within 7 days; one the poster ignores for 14 days goes to the admin by itself. Paying a disputed claim must be recorded as an `ADMIN_OVERRIDE`. | Poster and claimant colluding is the obvious fraud; a poster going silent on a real claim is the next. Two people, a delay and a note on every release, and the admin's `ReleasePreflight` (claimant newer than the bounty, no other activity, prior paid pairings with this poster, payout name mismatch, account age) in front of the decision. |
| **Claims need an established account.** An account must be 72 hours old before it can claim (`BOUNTY_CLAIM_MIN_ACCOUNT_AGE_HOURS`, default 72). | Whoever has the property can't open an account the day the bounty appears and claim it. With the payout-account hold and the cooling-off, about a week stands between a new identity and any money. |
| **One bank account per person, held 72 h.** The account number is never stored: an HMAC fingerprint ties one account to one person, a new account can't receive money for 72 hours, and a payout goes only to the claimant's own `ACTIVE` account. | Changing the account minutes before a payout is the classic mule move; the fingerprint stops one account collecting under many names without CIVIC/ONE holding account numbers. |
| **Full refund if nothing comes of it.** The poster can cancel while no claim is live; expiry, a declined review and an admin cancellation refund; a refund goes only to the original payment. With a live claim the poster can only ask CIVIC/ONE to cancel. | The poster never loses by posting; the only money out is to a verified claimant. Refund-to-source means there is no balance to withdraw, so CIVIC/ONE is never a wallet. |
| **Missing-person bounties are reviewed first and capped at 30 days.** A funded one lands in `PENDING_REVIEW`; an admin approves it onto the board or declines it with a refund. The SAPS case number is required and public (a sighting needs it to call 10111); how the poster knows the person is seen only by the poster and admins. | A bounty can endanger the person it describes, including someone who left a violent home. A short clock and a human before anything is public. |
| **Limits.** R200–R50 000 per bounty in whole rands; R100 000 held per poster; 3 open bounties per poster (unpaid ones count); 5 claims a day; one live claim per person per bounty; one winning claim per bounty. | Caps bound what any one fraud or chargeback can cost. Every number lives in `packages/core/src/bounty.ts` and the API, the app and the terms import it, so changing one is a deploy, not a rewrite. |
| **Frozen on chargebacks; reports go to review.** A card dispute freezes the bounty at once and nothing moves until an admin unfreezes it (time on hold is added back, within the kind's cap). A report puts the bounty in the admin queue, where it can be frozen, cancelled and refunded. | While the bank decides whether the deposit was legitimate, paying it out would be paying with money we may have to give back. |
| **Admin actions are never attributed by name.** Events by an admin show as "CIVIC/ONE"; the `actor_id` stays in the row for audit. An admin can't decide a claim on a bounty they posted or claimed, or approve their own. | A reviewer who can be identified can be pressured. |
| **Records outlive accounts.** Deleting an account is blocked while money is held for or owed to it; afterwards the bounties, claims, ledger rows and events keep going with `null` people. | Financial records have to survive the person who made them. |

## Money model

Money is tracked twice on purpose: every movement is a `ledger_entries` row (`DEPOSIT` · `RELEASE` · `REFUND` · `REVERSAL` · `CHARGEBACK` · `CHARGEBACK_REVERSED`, each `PENDING` → `SETTLED` | `FAILED` | `MISMATCH`), and the bounty carries running totals under `CHECK (released_cents + refunded_cents <= deposited_cents)`, so what goes out can never exceed what came in, whatever the code does.

- **Every transition is `UPDATE … WHERE status = <prior> RETURNING`**, inside one transaction with its ledger and `bounty_events` rows. Two requests can't both move the same money: the second finds no row and gets "This bounty changed while you were looking at it."
- **Provider calls only after commit.** Checkout, transfer and refund are asked for only once the transaction recording the intent has committed, and their results are applied by idempotent functions (`settleDeposit`, `applyTransfer`, `applyRefund`) keyed on *our* reference. The return page, the webhook and the hourly sweep all run the same functions. A crash between commit and provider leaves a `PENDING` row that the sweep re-drives; a transfer is fetched by reference before it is sent again, so a retry never pays twice.
- **References are ours and deterministic:** `dep-<bounty>-<n>`, `rel-<claim>-<n>`, `ref-<bounty>-<n>`, plus `rev-…` and `cbk-…` for what the bank does to us. The attempt number means a replaced checkout or a retried payout is a new row, never a changed one. `reference` and `idempotency_key` (`release:<claim>:<n>` and so on) are both unique.
- **Partial unique indexes promise what code paths can't:** one live deposit per bounty (`ledger_one_live_deposit_idx`), one release per bounty (`ledger_one_release_idx`, over `PENDING` and `SETTLED`), one winning claim per bounty (`bounty_claims_one_winner_idx`: `CONFIRMED` / `VERIFIED` / `PAID`), one live claim per person per bounty, one `ACTIVE` payout account per person and one person per account fingerprint.
- **Money counts only when the provider says so.** A `charge.success` webhook is never credited from its body: the API re-verifies the reference with the provider. A deposit whose amount or currency differs from what was asked is recorded as `MISMATCH` for an admin and the bounty stays unfunded. A deposit that settles after the bounty was abandoned or cancelled is taken in and refunded straight away.
- **`payment_events` dedupes webhooks** on `(provider, event_key)`. Paystack has no event id, so the key is the event name plus the object's id, or a hash of the body. The row is inserted before the event is applied and its `outcome` written after, so a redelivery is a no-op and an event that failed to apply is visible.
- **Ledger rows are immutable.** A trigger refuses `DELETE` and any change to the amount, type, bounty, reference, idempotency key or currency; a row may only settle or fail. Reversals and chargebacks are new rows.
- **The hourly sweep** (`sweep()` in `apps/api/src/data/bounties.ts`) abandons `PENDING_PAYMENT` bounties older than 24 h, expires and refunds `OPEN` bounties past their date that have no live or still-disputable claim, writes the "expires in 3 days" event, escalates `SUBMITTED` claims unanswered for 14 days to `DISPUTED`, and re-drives `PENDING` ledger rows older than an hour: verify a deposit, re-send a transfer, re-send a refund that never reached the provider.
- **The admin queue** is everything that needs a human: `PENDING_REVIEW`, `AWAITING_VERIFICATION`, `RELEASING` and `FROZEN` bounties, plus any with a disputed claim, a report, a failed payout, a mismatched deposit or a cancellation request.

## State machines

```
Bounty — the happy path, then the exits

 PENDING_PAYMENT ─paid─► OPEN ─poster confirms a claim─► AWAITING_VERIFICATION ─admin verifies─► RELEASING ─transfer settles─► PAID
       │ missing person   ▲                                 │ admin rejects the claim: back to OPEN,      │ bank reverses the payout: stays
       ▼                  │ admin approves                  │ or EXPIRED + refund if its time ran out     │ RELEASING, claim back to VERIFIED,
  PENDING_REVIEW ─────────┘                                                                               │ admin retries to the current account
       │ admin declines ─► CANCELLED (refund)

 PENDING_PAYMENT ─unpaid for 24 h (sweep), or deleted by the poster─► ABANDONED
 OPEN ─past its date with no live claim (sweep)─► EXPIRED (refund)
 OPEN · PENDING_REVIEW ─poster cancels while no claim is live─► CANCELLED (refund)
 OPEN · AWAITING_VERIFICATION · PENDING_REVIEW · FROZEN ─admin cancels─► CANCELLED (refund; live claims REJECTED as BOUNTY_CLOSED)
 OPEN · AWAITING_VERIFICATION · PENDING_REVIEW ─chargeback opened, or admin─► FROZEN ─admin unfreezes─► the status it came from

Claim

 SUBMITTED ─poster confirms─► CONFIRMED ─admin verifies after the cooling-off─► VERIFIED ─transfer settles─► PAID
     │                            │ admin rejects ─► REJECTED                        │ bank reverses ─► VERIFIED (retried)
     ├─poster rejects─► REJECTED_BY_POSTER ─claimant disputes within 7 days─► DISPUTED ─admin verifies, recorded as ADMIN_OVERRIDE─► VERIFIED
     │                                                                            ├─admin rejects─► REJECTED
     ├─unanswered for 14 days (sweep)─► DISPUTED                                  └─poster confirms after all─► CONFIRMED
     ├─claimant withdraws (from SUBMITTED, REJECTED_BY_POSTER or DISPUTED)─► WITHDRAWN
     └─the bounty closes─► REJECTED (BOUNTY_CLOSED) · another claim is paid─► REJECTED (OTHER_CLAIM_PAID)
```

A disputed claim is decided while the bounty is still `OPEN`, so verifying one takes the bounty straight to `RELEASING`. `FROZEN` remembers where it came from (`frozen_from_status`). `PAID` stays on the board as "Honoured"; `CANCELLED` and `EXPIRED` pages still open, so a shared link explains itself.

## Providers

The bounty code imports a `PaymentProvider` interface (`apps/api/src/payments/types.ts`) and nothing provider-specific: `createCheckout` · `verifyCheckout` · `listBanks` · `createRecipient` · `transfer` · `fetchTransfer` · `refund` · `parseWebhook`, in cents, with our references echoed back. Swapping the provider is a new file behind that interface.

| Option | Verdict |
| --- | --- |
| **Paystack** ✅ now | ZAR card checkout (cards only, so a refund always has somewhere to go), refunds against the transaction, `basa` bank-account recipients and transfers from the balance, a `GET /bank?currency=ZAR` list. Webhooks arrive signed with HMAC-SHA512 of the raw body in `x-paystack-signature`, compared in constant time before anything is parsed. Test and live keys run the same code (`mode` is read off the `sk_live_` prefix). Needs a registered business with transfers enabled and OTP approval off. What it isn't: a licensed escrow. The money sits in CIVIC/ONE's Paystack balance, which is the legal question in the gate. |
| **TradeSafe** | A licensed South African escrow, which would take the hold leg off CIVIC/ONE and may settle the TPPP question outright, at a per-transaction fee and with its own onboarding. Not built; the interface above is the whole contract, so it can be added later without touching the bounty code. |
| **Ozow** | Instant EFT, which many posters would prefer to a card, but no refund API: a cancelled bounty would need a manual payout to a bank account, which is exactly the wallet behaviour the rules avoid. Could join later as a second checkout channel if refunds are solved. |
| **Sandbox** (local and tests only) | `sandboxProvider`: instant, deterministic, in memory. A checkout is "paid" when the return page calls `sandboxCompleteCheckout` (`SUCCESS` / `FAILED` / `WRONG_AMOUNT` exercise the settle, fail and mismatch paths); a transfer to an account ending `0000` fails and one ending `9999` succeeds then reads back as reversed; refunds settle at once; no webhook ever verifies. `readEnv` refuses it in QA and prod. |

## Configuration

- **`PAYMENTS_PROVIDER`** = `disabled` | `sandbox` | `paystack`. Locally, unset means `sandbox`; in `qa` and `prod`, unset means `disabled`, and `sandbox` is refused outright. `paystack` needs `PAYSTACK_SECRET_KEY` (inline, local) or `PAYSTACK_SECRET_ARN` (deployed). `disabled` keeps the board readable (`paymentsStatus: DISABLED`); `createBounty` and `setPayoutAccount` refuse with "Bounties are coming soon. Posting opens once payments go live."
- **The secret** is one Secrets Manager secret as JSON, `{"secretKey": "sk_…", "fingerprintKey": "<random, never rotated>"}`. The fingerprint key is separate so the Paystack key can be rotated without orphaning every payout account (a plain-string secret also works, but then the Paystack key *is* the fingerprint key; don't). The CDK stack sets `PAYMENTS_PROVIDER=paystack` and `PAYSTACK_SECRET_ARN`, and grants the GraphQL Lambda read on the secret, only when the stage has a secret name (`PAYSTACK_SECRET_NAME` on the GitHub environment → `QA_`/`PROD_PAYSTACK_SECRET_NAME`). No secret name, no provider.
- **`ADMIN_HANDLES`**: comma-separated handles who review bounties and release money, checked by `ctx.requireAdmin()`. It is a list, not a role: sign-in never hands it out, and `viewerIsAdmin` is visible only to the account owner. Locally it defaults to `civicone`, the newsroom demo account; deployed it defaults to nobody and is set per environment.
- **`BOUNTY_CLAIM_MIN_ACCOUNT_AGE_HOURS`**: how old an account must be to claim; 72 when unset, `0` to switch the rule off (useful locally with a brand-new sign-in; the seeded demo accounts are months old).
- **`SITE_URL` / `PUBLIC_CONFIG_PARAM`**: where checkout sends people back to (`/bounties/<id>/paid`). Locally `SITE_URL`, defaulting to the first CORS origin. Deployed, the API reads `CIVIC_SITE_URL` from the Web stack's SSM parameter `/civic/<stage>/web/public-config` at cold start, like the SSR Lambda does; it doesn't exist on the very first deploy, when nothing can be paid for anyway.
- **The webhook route** is `POST /payments/paystack/webhook`: CloudFront `/payments/*` (no cache, all viewer headers) → HTTP API `/payments/{proxy+}` → the GraphQL Lambda, which verifies the signature over the raw bytes before reading the body. 401 for a bad signature, 404 while no provider is configured, 200 with the outcome, 500 so Paystack redelivers. The dev server mounts the same path. The direct API Gateway URL also works for the Paystack dashboard.
- **The sweep** is an EventBridge rule, every hour, invoking the same GraphQL Lambda with `{ "source": "civic.sweep" }` (an event without a `requestContext` runs `sweep()` instead of Yoga). It exists only where `payments.sweep` is true, which is prod: on QA it would keep Aurora from pausing, so QA is driven by the admin mutation `sweepBounties`, which runs the same function anywhere.
- **The smoke test** posts an unsigned body to `/payments/paystack/webhook` on every deploy and expects 401 (provider on) or 404 (disabled). Anything else means CloudFront or the HTTP API isn't wired.

## The go-live gate

Everything up to here runs on QA with test keys. Before `PAYSTACK_SECRET_NAME` is set on the `production` environment:

- [ ] **A written legal opinion** on whether this flow (Paystack checkout → CIVIC/ONE's Paystack balance → CIVIC/ONE-instructed transfer) makes the operator a third-party payment provider under NPS Act s 7 and SARB Directive 1 of 2007, and if so whether to register through a sponsoring bank or restructure so a licensed holder (TradeSafe) takes the hold leg; whether the refundable hold is a "deposit" under the Banks Act; and whether the operator is an accountable institution under FICA Schedule 1 item 19, with a proportionate RMCP for a one-person operator at a R50 000 cap.
- [ ] **Paystack's written acceptance** of the hold-and-later-payout use case for a South African merchant (its ineligible list includes remittance and wallet businesses), and confirmation that the Paystack balance can fund transfers, that is, that it is the settlement destination for ZAR card revenue, or what a top-up costs and how long it takes.
- [ ] **A registered business entity** as the Paystack merchant (transfers are for registered businesses) and as the operator named in the terms and privacy policy.
- [ ] **The secret**, created by an account administrator because the deploy role can't create secrets: `aws secretsmanager create-secret --name civic/prod/paystack --secret-string '{"secretKey":"sk_live_…","fingerprintKey":"<openssl rand -base64 32>"}'`, then `PAYSTACK_SECRET_NAME=civic/prod/paystack` on the `production` environment. `ADMIN_HANDLES` on `production` names at least one reviewer whose Google or Apple account has MFA, since there is no in-app MFA.
- [ ] **A R2 test transaction and one R1 transfer on QA** with test keys (`civic/qa/paystack`, `PAYSTACK_SECRET_NAME` on `qa`): the checkout settles through both the return page and the webhook, and the transfer settles to a real account. This confirms what is assumed, not verified: cents on initialize, transfer and refund; `trxref` on the callback; the ZAR bank list; duplicate-reference behaviour on transfers; whether processing fees come back on a refund.
- [ ] **The Paystack dashboard** for the live keys: webhook URL `https://<site>/payments/paystack/webhook`, transfers enabled, OTP approval for transfers switched off.
- [ ] Then the next deploy to prod runs with `PAYMENTS_PROVIDER=paystack`; the hourly sweep rule (already in the prod stack) starts moving money, and `paymentsStatus` reads `PAYSTACK_LIVE`.

## Risks and open questions

1. **TPPP status is the make-or-break question.** Holding posters' money and paying claimants looks like third-party payment provision under NPS Act s 7 and Directive 1 of 2007, with the Banks Act and FICA item 19 riding on it, and the regime is moving from PASA to the SARB. Live keys wait for the opinion; the provider interface keeps the TradeSafe route open.
2. **Balance versus settlement (unconfirmed, highest operational impact).** Transfers draw from the Paystack balance, while South African card revenue appears to settle to the merchant's bank account on T+2, with top-ups at 1%. If the balance can't be the settlement destination, every payout needs a manual top-up. The `FAILED` → `retryBountyPayout` path tolerates it, but "verify and pay" becomes "verify, top up, pay".
3. **One admin.** Dual control is the poster plus one human, so an admin account takeover is a total-loss event, bounded by the caps. MFA on the admin's identity provider, a second reviewer before the caps rise, and a digest of `CLAIM_VERIFIED` events to the owner.
4. **Missing-person review is a judgement call.** The case-number requirement does most of the work and the admin cancel is the safety valve, but a reviewer can't tell an estranged adult from a lost one. Consider launching property and information first, and a standing arrangement with a victim-support organisation for borderline approvals.
5. **Chargeback exposure after payout.** The 72-hour hold and the cooling-off don't cover a card's 120-day dispute window. After `PAID`, a chargeback is recorded (`CHARGEBACK` row) but the money has gone to the claimant; the loss is the platform's, capped per bounty. If it bites, lengthen the hold for first-time posters rather than adding identity checks.
6. **Refund cost.** Full refunds mean CIVIC/ONE absorbs Paystack's processing fee on every cancelled, expired or declined bounty (roughly 2.9% + R1, about R1 450 on R50 000) unless fees come back on refund, which is one of the unconfirmed facts. Deducting it sits near the CPA grey list; the terms choose the full refund.
7. **No phrase lists.** The only text rules are deterministic: no `@mentions`, no ID or card numbers, no street address in a missing-person bounty. Whether a bounty targets a person is decided by reports and the reviewer. An advisory suspect-description guard like the composer's privacy guard, routing to review rather than refusing, is the obvious next layer, and it will need tuning for Afrikaans and isiXhosa.
8. **Name validation.** `account_name` is what Paystack resolves for the recipient, or else what the claimant typed; the preflight flags a mismatch with the display name, but nobody has checked the name with the bank. Paystack Account Validation (a fee per call) once the account supports it.
9. **Electron checkout.** Paystack opens in the system browser and the return lands on the web app, which works but leaves the desktop window behind. Allowing `checkout.paystack.com` in the desktop shell's `isAuthUrl` would keep it in-app; a product call.
10. **Caps and clocks are guesses.** R200, R50 000, 3 open, 5 claims a day, 72 h, 7 and 14 days are all in one file and the terms import them, so a change is a deploy, not a rewrite.

## Not done yet (recommended next)

- **Uploads:** photos as evidence. Claims take up to three `https` links, shown as text. When uploads come, strip EXIF and GPS and never embed them on the poster's page.
- **Email and push notifications** for bounty events. Every transition writes a `bounty_events` row with a `recipient_id`, and the in-app notifications read them; nothing leaves the app yet.
- **Paystack Account Validation** of payout accounts, so "name on the account" is checked rather than typed.
- **A platform fee.** `platform_fee_cents` and `vat_cents` exist on the bounty and are charged at zero; the deposit row already adds them to the reward, and the terms promise to show a fee before payment.
- **Multiple admins with MFA**, and a per-person freeze: today only bounties freeze, and a repeat offender is handled by hand.
- **A TradeSafe adapter** behind the same interface.
- **Removing a payout account** (today it can only be replaced), and **extending a bounty** before it expires.
- **Retention jobs:** scrubbing a missing-person bounty's text soon after it closes and claim text after a year, as the privacy policy will promise.
