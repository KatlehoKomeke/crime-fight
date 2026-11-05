import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { type Bank, type CheckoutResult, type PaymentProvider, PaymentProviderError, type RefundStatus, type TransferStatus } from './types'

/*
 * Paystack (https://paystack.com/docs/api). ZAR amounts are in cents. South
 * African bank accounts are `basa` recipients; transfers need a registered
 * business with transfers enabled and OTP approval switched off. Webhooks are
 * signed with the secret key of the mode (test/live) that sent them:
 * `x-paystack-signature` = hex HMAC-SHA512 of the raw body.
 */

const API = 'https://api.paystack.co'

interface PaystackResponse<T> {
  status: boolean
  message: string
  data: T
}

interface PaystackTransaction {
  id: number
  status: string
  reference: string
  amount: number
  currency: string
  fees: number | null
}

interface PaystackTransfer {
  id: number
  status: string
  reference: string
  transfer_code: string
}

interface PaystackRefund {
  id: number
  status: string
}

const transferStatus = (status: string): TransferStatus => {
  switch (status) {
    case 'success':
      return 'SUCCESS'
    case 'failed':
    case 'abandoned':
    case 'blocked':
      return 'FAILED'
    case 'reversed':
      return 'REVERSED'
    default:
      // pending, received, otp, queued
      return 'PENDING'
  }
}

const refundStatus = (status: string): RefundStatus => (status === 'processed' ? 'SETTLED' : status === 'failed' ? 'FAILED' : 'PENDING')

export function paystackProvider(secretKey: string): PaymentProvider {
  const mode = secretKey.startsWith('sk_live_') ? 'LIVE' : 'TEST'
  let banks: Promise<Bank[]> | undefined

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<PaystackResponse<T>> {
    const headers = { authorization: `Bearer ${secretKey}`, 'content-type': 'application/json', accept: 'application/json' }
    const init: RequestInit = method === 'POST' ? { method, headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) } : { method, headers, signal: AbortSignal.timeout(15_000) }
    const response = await fetch(`${API}${path}`, init)
    const json = (await response.json().catch(() => null)) as PaystackResponse<T> | null
    if (!response.ok || !json?.status) {
      throw new PaymentProviderError(`Paystack ${method} ${path}: ${response.status} ${json?.message ?? response.statusText}`, response.status)
    }
    return json
  }

  const notFound = (error: unknown) => error instanceof PaymentProviderError && error.status === 404

  return {
    name: 'paystack',
    mode,

    async createCheckout({ reference, amountCents, currency, email, callbackUrl, metadata }) {
      const { data } = await call<{ authorization_url: string; access_code: string; reference: string }>('POST', '/transaction/initialize', {
        email,
        amount: amountCents,
        currency,
        reference,
        callback_url: callbackUrl,
        metadata: JSON.stringify(metadata),
        // Cards only: a cancelled bounty is refunded to what paid for it, and card refunds are the ones Paystack's API supports.
        channels: ['card'],
      })
      return { url: data.authorization_url, providerRef: data.access_code }
    },

    async verifyCheckout(reference) {
      try {
        const { data } = await call<PaystackTransaction>('GET', `/transaction/verify/${encodeURIComponent(reference)}`)
        const status: CheckoutResult['status'] = data.status === 'success' ? 'SUCCESS' : data.status === 'failed' || data.status === 'abandoned' || data.status === 'reversed' ? 'FAILED' : 'PENDING'
        return { status, amountCents: data.amount, currency: data.currency, providerRef: String(data.id), feeCents: data.fees ?? null }
      } catch (error) {
        if (notFound(error)) return null
        throw error
      }
    },

    listBanks() {
      // South African banks; cached per container, they don't change.
      banks ??= call<Array<{ name: string; code: string; active: boolean; currency: string }>>('GET', '/bank?currency=ZAR&perPage=100').then(({ data }) =>
        data
          .filter((bank) => bank.active !== false)
          .map((bank) => ({ name: bank.name, code: bank.code }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
      return banks.catch((error: unknown) => {
        banks = undefined
        throw error
      })
    },

    async createRecipient({ name, accountNumber, bankCode }) {
      const { data } = await call<{ recipient_code: string; details?: { account_name?: string | null } }>('POST', '/transferrecipient', {
        type: 'basa',
        name,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: 'ZAR',
      })
      return { recipientCode: data.recipient_code, accountName: data.details?.account_name ?? null }
    },

    async transfer({ reference, amountCents, currency, recipientCode, reason }) {
      const { data } = await call<PaystackTransfer>('POST', '/transfer', { source: 'balance', amount: amountCents, currency, recipient: recipientCode, reason, reference })
      return { status: transferStatus(data.status), providerRef: data.transfer_code }
    },

    async fetchTransfer(reference) {
      try {
        const { data } = await call<PaystackTransfer>('GET', `/transfer/verify/${encodeURIComponent(reference)}`)
        return { status: transferStatus(data.status), providerRef: data.transfer_code }
      } catch (error) {
        if (notFound(error)) return null
        throw error
      }
    },

    async refund({ transactionRef, amountCents, currency, note }) {
      const { data } = await call<PaystackRefund>('POST', '/refund', { transaction: transactionRef, amount: amountCents, currency, merchant_note: note })
      return { status: refundStatus(data.status), providerRef: String(data.id) }
    },

    parseWebhook(rawBody, signature) {
      if (!signature) return null
      const expected = Buffer.from(createHmac('sha512', secretKey).update(rawBody).digest('hex'))
      const given = Buffer.from(signature)
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null

      const event = JSON.parse(rawBody.toString('utf8')) as { event: string; data: Record<string, unknown> }
      const data = event.data ?? {}
      // Paystack has no event id; the body hash tells a redelivery from a new event.
      const eventKey = `${event.event}:${(data.id as number | undefined) ?? createHash('sha256').update(rawBody).digest('hex').slice(0, 32)}`
      const reference = String(data.reference ?? '')
      switch (event.event) {
        case 'charge.success':
          return { type: 'CHARGE_SUCCESS', eventKey, eventType: event.event, reference }
        case 'transfer.success':
        case 'transfer.failed':
        case 'transfer.reversed':
          return {
            type: 'TRANSFER',
            eventKey,
            eventType: event.event,
            reference,
            status: event.event === 'transfer.success' ? 'SUCCESS' : event.event === 'transfer.failed' ? 'FAILED' : 'REVERSED',
            providerRef: (data.transfer_code as string | undefined) ?? null,
          }
        case 'refund.pending':
        case 'refund.processing':
        case 'refund.processed':
        case 'refund.failed':
          return {
            type: 'REFUND',
            eventKey,
            eventType: event.event,
            transactionRef: String(data.transaction_reference ?? ''),
            status: refundStatus(event.event.slice('refund.'.length)),
            providerRef: (data.refund_reference as string | undefined) ?? null,
          }
        case 'charge.dispute.create':
        case 'charge.dispute.remind':
        case 'charge.dispute.resolve': {
          const transaction = data.transaction as { reference?: string } | undefined
          return { type: 'CHARGEBACK', eventKey, eventType: event.event, transactionRef: transaction?.reference ?? reference, status: event.event.endsWith('resolve') ? 'RESOLVED' : 'CREATED' }
        }
        default:
          return { type: 'IGNORED', eventKey, eventType: event.event }
      }
    },
  }
}
