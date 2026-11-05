import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import type { ApiEnv } from '../env'
import { paystackProvider } from './paystack'
import { sandboxProvider } from './sandbox'
import type { PaymentProvider } from './types'

export type { PaymentProvider } from './types'
export { PaymentProviderError } from './types'

/** Everything the bounty code needs to know about money, resolved once per container. */
export interface Payments {
  provider: PaymentProvider | null
  /** Where checkout sends people back to. */
  siteUrl: string
  /** Keys one bank account to one person without storing the account number (see payout_accounts.fingerprint). */
  fingerprintKey: string
  /** How old an account must be before it can claim a bounty. */
  claimMinAccountAgeHours: number
}

/**
 * Deployed, the Paystack key lives in Secrets Manager as
 * `{"secretKey": "sk_...", "fingerprintKey": "<random, never rotated>"}` and
 * the site URL in the SSM parameter the Web stack publishes (missing on the
 * very first deploy, when nothing can be paid for anyway). Both are read at
 * cold start, like the SSR Lambda's config.
 */
export async function resolvePayments(env: ApiEnv): Promise<Payments> {
  let siteUrl = env.siteUrl
  if (!siteUrl && env.publicConfigParam) {
    try {
      const { Parameter } = await new SSMClient({}).send(new GetParameterCommand({ Name: env.publicConfigParam }))
      siteUrl = (JSON.parse(Parameter?.Value ?? '{}') as { CIVIC_SITE_URL?: string }).CIVIC_SITE_URL
    } catch (error) {
      console.error('[payments] site URL not read; checkouts will fail until the next cold start', error)
    }
  }
  siteUrl ??= 'http://localhost:8081'
  const claimMinAccountAgeHours = env.claimMinAccountAgeHours

  if (env.paymentsProvider === 'sandbox') {
    return { provider: sandboxProvider({ siteUrl }), siteUrl, fingerprintKey: 'sandbox', claimMinAccountAgeHours }
  }
  if (env.paymentsProvider === 'paystack') {
    try {
      return { provider: paystackProvider(await paystackKeys(env, fingerprint)), siteUrl, fingerprintKey: fingerprint.key, claimMinAccountAgeHours }
    } catch (error) {
      // Bounties are one feature: a secret that can't be read switches them off for this container, with an error in the
      // logs and `paymentsStatus: DISABLED` on the site (the deploy's smoke test expects the provider), not a dead API.
      console.error('[payments] Paystack not configured; bounties are switched off until the next cold start', error)
      return { provider: null, siteUrl, fingerprintKey: 'disabled', claimMinAccountAgeHours }
    }
  }
  return { provider: null, siteUrl, fingerprintKey: 'disabled', claimMinAccountAgeHours }
}

const fingerprint = { key: '' }

/** The Paystack secret key, and the fingerprint key beside it. Deployed, both come from the secret, and both are required. */
async function paystackKeys(env: ApiEnv, out: { key: string }): Promise<string> {
  if (env.paystackSecretKey) {
    // Local only (PAYSTACK_SECRET_KEY inline): nothing to rotate, so the key may double as the fingerprint key.
    out.key = env.paystackSecretKey
    return env.paystackSecretKey
  }
  if (!env.paystackSecretArn) throw new Error('No Paystack secret key found')
  const { SecretString } = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: env.paystackSecretArn }))
  const raw = (SecretString ?? '').trim()
  const parsed = raw.startsWith('{') ? (JSON.parse(raw) as { secretKey?: string; fingerprintKey?: string }) : { secretKey: raw }
  if (!parsed.secretKey) throw new Error('The Paystack secret has no secretKey')
  // One bank account, one person: the fingerprint key must outlive any rotation of the Paystack key, so it is its own value.
  if (!parsed.fingerprintKey) throw new Error('The Paystack secret has no fingerprintKey; store it as {"secretKey": "...", "fingerprintKey": "..."}')
  out.key = parsed.fingerprintKey
  return parsed.secretKey
}

export const disabledPayments = (siteUrl = 'http://localhost:8081'): Payments => ({ provider: null, siteUrl, fingerprintKey: 'disabled', claimMinAccountAgeHours: 72 })
