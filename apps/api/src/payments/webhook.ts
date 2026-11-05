import { handleProviderEvent, type MoneyContext } from '../data/bounties'

/**
 * `POST /payments/<provider>/webhook`. The signature is the only gate: a body
 * that doesn't verify against our secret key is dropped with a 401 and nothing
 * is read from it. Verified events are recorded before they're applied, so a
 * redelivery is a no-op, and the answer is always quick (Paystack retries
 * anything slower than its timeout).
 */
export async function handleWebhook(ctx: MoneyContext, providerName: string, rawBody: Buffer, signature: string | undefined): Promise<{ status: number; body: string }> {
  const provider = ctx.payments.provider
  if (!provider || provider.name !== providerName) return { status: 404, body: 'No such provider' }
  const event = provider.parseWebhook(rawBody, signature)
  if (!event) return { status: 401, body: 'Bad signature' }
  try {
    const outcome = await handleProviderEvent(ctx, event, rawBody.toString('utf8'))
    return { status: 200, body: outcome }
  } catch (error) {
    // Paystack will redeliver; the event row's missing outcome shows what's still to apply.
    console.error('[payments] webhook not applied', { event: event.eventKey, error })
    return { status: 500, body: 'Not applied' }
  }
}
