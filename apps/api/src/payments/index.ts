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
    let secretKey = env.paystackSecretKey
    let fingerprintKey: string | undefined
    if (!secretKey && env.paystackSecretArn) {
      const { SecretString } = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: env.paystackSecretArn }))
      const raw = (SecretString ?? '').trim()
      if (raw.startsWith('{')) {
        const parsed = JSON.parse(raw) as { secretKey?: string; fingerprintKey?: string }
        secretKey = parsed.secretKey
        fingerprintKey = parsed.fingerprintKey
      } else {
        secretKey = raw
      }
    }
    if (!secretKey) throw new Error('No Paystack secret key found')
    // One bank account, one person: the fingerprint key must outlive any key rotation, so it's its own value.
    return { provider: paystackProvider(secretKey), siteUrl, fingerprintKey: fingerprintKey ?? secretKey, claimMinAccountAgeHours }
  }
  return { provider: null, siteUrl, fingerprintKey: 'disabled', claimMinAccountAgeHours }
}

export const disabledPayments = (siteUrl = 'http://localhost:8081'): Payments => ({ provider: null, siteUrl, fingerprintKey: 'disabled', claimMinAccountAgeHours: 72 })
