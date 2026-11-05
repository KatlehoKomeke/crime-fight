import type { Bank, CheckoutResult, PaymentProvider } from './types'

/*
 * A pretend provider for local development and tests: deterministic, instant,
 * and able to fail on demand so the failure paths get exercised.
 *   - A checkout is "paid" when something calls `complete(reference)`; the app
 *     does that from the return page's "Simulate payment" button.
 *   - Recipients encode the account's last four digits; a transfer to an
 *     account ending 0000 fails, one ending 9999 succeeds then reverses.
 * Never selectable in a deployed stage (see readEnv).
 */

export const SANDBOX_BANKS: Bank[] = [
  { name: 'Absa', code: '632005' },
  { name: 'Capitec', code: '470010' },
  { name: 'Discovery Bank', code: '679000' },
  { name: 'FNB', code: '250655' },
  { name: 'Nedbank', code: '198765' },
  { name: 'Standard Bank', code: '051001' },
  { name: 'TymeBank', code: '678910' },
]

export interface SandboxProvider extends PaymentProvider {
  /** Marks a checkout as paid (or failed, or paid with the wrong amount, to exercise the mismatch path). */
  complete(reference: string, outcome: 'SUCCESS' | 'FAILED' | 'WRONG_AMOUNT'): void
  /** What the sandbox would answer for a reference, for tests. */
  checkouts: Map<string, CheckoutResult>
}

export function sandboxProvider({ siteUrl }: { siteUrl: string }): SandboxProvider {
  const checkouts = new Map<string, CheckoutResult>()
  const sessions = new Map<string, { amountCents: number; currency: string }>()
  const transfers = new Map<string, { status: 'SUCCESS' | 'FAILED' | 'REVERSED' }>()
  let counter = 0

  return {
    name: 'sandbox',
    mode: 'TEST',
    checkouts,

    complete(reference, outcome) {
      const session = sessions.get(reference)
      if (!session) throw new Error(`Sandbox has no checkout ${reference}`)
      const amount = outcome === 'WRONG_AMOUNT' ? session.amountCents - 100 : session.amountCents
      checkouts.set(reference, { status: outcome === 'FAILED' ? 'FAILED' : 'SUCCESS', amountCents: amount, currency: session.currency, providerRef: `sbx_txn_${++counter}`, feeCents: 0 })
    },

    createCheckout({ reference, amountCents, currency, callbackUrl }) {
      sessions.set(reference, { amountCents, currency })
      const url = new URL(callbackUrl, siteUrl)
      url.searchParams.set('reference', reference)
      url.searchParams.set('sandbox', '1')
      return Promise.resolve({ url: url.toString(), providerRef: null })
    },

    verifyCheckout(reference) {
      const known = checkouts.get(reference)
      if (known) return Promise.resolve(known)
      const session = sessions.get(reference)
      return Promise.resolve(session ? { status: 'PENDING', amountCents: session.amountCents, currency: session.currency, providerRef: '', feeCents: null } : null)
    },

    listBanks: () => Promise.resolve(SANDBOX_BANKS),

    createRecipient({ name, accountNumber, bankCode }) {
      return Promise.resolve({ recipientCode: `RCP_sandbox_${bankCode}_${accountNumber.slice(-4)}`, accountName: name })
    },

    transfer({ reference, recipientCode }) {
      const last4 = recipientCode.slice(-4)
      const status = last4 === '0000' ? 'FAILED' : 'SUCCESS'
      transfers.set(reference, { status: last4 === '9999' ? 'REVERSED' : status })
      return Promise.resolve({ status, providerRef: `TRF_sandbox_${++counter}` })
    },

    fetchTransfer(reference) {
      const transfer = transfers.get(reference)
      return Promise.resolve(transfer ? { status: transfer.status, providerRef: `TRF_sandbox_${reference}` } : null)
    },

    refund() {
      return Promise.resolve({ status: 'SETTLED', providerRef: `RFD_sandbox_${++counter}` })
    },

    fetchRefund(providerRef) {
      return Promise.resolve({ status: 'SETTLED', providerRef })
    },

    parseWebhook: () => null,
  }
}
