/*
 * The money layer behind bounties. Everything the product needs from a payment
 * provider, and nothing provider-specific, so Paystack can be replaced by a
 * licensed escrow provider without touching the bounty code.
 *
 * Amounts are cents. References are ours: deterministic, unique, and echoed
 * back by the provider, so a retried or redelivered step finds its ledger row.
 */

export interface CheckoutSession {
  /** Where to send the payer. */
  url: string
  providerRef: string | null
}

export type CheckoutStatus = 'SUCCESS' | 'PENDING' | 'FAILED'

export interface CheckoutResult {
  status: CheckoutStatus
  amountCents: number
  currency: string
  /** The provider's transaction id, which refunds are made against. */
  providerRef: string
  feeCents: number | null
}

export interface Bank {
  name: string
  code: string
}

export interface Recipient {
  recipientCode: string
  /** The name the bank has for the account, when the provider resolves it. */
  accountName: string | null
}

export type TransferStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REVERSED'

export interface TransferResult {
  status: TransferStatus
  providerRef: string | null
}

export type RefundStatus = 'PENDING' | 'SETTLED' | 'FAILED'

export interface RefundResult {
  status: RefundStatus
  providerRef: string | null
}

/** A verified webhook, reduced to what the ledger acts on. `transactionRef` is the transaction's reference, which is ours. */
export type ProviderEvent =
  | { type: 'CHARGE_SUCCESS'; eventKey: string; eventType: string; reference: string }
  | { type: 'TRANSFER'; eventKey: string; eventType: string; reference: string; status: 'SUCCESS' | 'FAILED' | 'REVERSED'; providerRef: string | null }
  | { type: 'REFUND'; eventKey: string; eventType: string; transactionRef: string; status: RefundStatus; providerRef: string | null }
  | { type: 'CHARGEBACK'; eventKey: string; eventType: string; transactionRef: string; status: 'CREATED' | 'REMINDED' | 'RESOLVED'; resolution: string | null }
  | { type: 'IGNORED'; eventKey: string; eventType: string }

export interface PaymentProvider {
  readonly name: 'paystack' | 'sandbox'
  /** `TEST` for Paystack test keys and the sandbox; `LIVE` moves real money. */
  readonly mode: 'TEST' | 'LIVE'
  createCheckout(input: { reference: string; amountCents: number; currency: string; email: string; callbackUrl: string; metadata: Record<string, string> }): Promise<CheckoutSession>
  /** Null when the provider has never seen the reference. */
  verifyCheckout(reference: string): Promise<CheckoutResult | null>
  listBanks(): Promise<Bank[]>
  createRecipient(input: { name: string; accountNumber: string; bankCode: string }): Promise<Recipient>
  transfer(input: { reference: string; amountCents: number; currency: string; recipientCode: string; reason: string }): Promise<TransferResult>
  /** Null when the provider has no transfer with that reference. */
  fetchTransfer(reference: string): Promise<TransferResult | null>
  refund(input: { transactionRef: string; amountCents: number; currency: string; note: string }): Promise<RefundResult>
  /** How a refund the provider accepted went, by the provider's id for it; null when it has no such refund. */
  fetchRefund?(providerRef: string): Promise<RefundResult | null>
  /** Null when the signature doesn't verify. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): ProviderEvent | null
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'PaymentProviderError'
  }
}
