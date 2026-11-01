import type { Identity } from './auth'
import { lambdaSigner } from './aws'

/**
 * The identity provider's copy of a person's sign-in. Cognito keeps their name
 * and email too, so deleting an account removes it there as well.
 */
export interface SignIns {
  /** False once the sign-in has been deleted, though its ID tokens stay valid until they expire. */
  exists(identity: Identity): Promise<boolean>
  remove(identity: Identity): Promise<void>
}

/** Local development and tests: dev identities have no sign-in record to check or remove. */
export const localSignIns: SignIns = {
  exists: () => Promise.resolve(true),
  remove: () => Promise.resolve(),
}

/**
 * Cognito users, by the `cognito:username` claim (e.g. `google_1234…` for a
 * federated user). Called as the Lambda's IAM role, no SDK needed.
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminDeleteUser.html
 */
export function cognitoSignIns(userPoolId: string): SignIns {
  const region = userPoolId.split('_')[0] ?? ''
  const host = `cognito-idp.${region}.amazonaws.com`
  const signer = lambdaSigner('cognito-idp', region)

  const call = async (action: 'AdminGetUser' | 'AdminDeleteUser', username: string) => {
    const body = JSON.stringify({ UserPoolId: userPoolId, Username: username })
    const signed = await signer.sign({
      method: 'POST',
      protocol: 'https:',
      hostname: host,
      path: '/',
      headers: { host, 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': `AWSCognitoIdentityProviderService.${action}` },
      body,
    })
    const response = await fetch(`https://${host}/`, { method: 'POST', headers: signed.headers, body })
    if (response.ok) {
      void response.body?.cancel() // the user's attributes aren't needed
      return true
    }
    const text = await response.text()
    // Cognito reports a missing user as a 400 with this exception type.
    if (response.status === 400 && text.includes('UserNotFoundException')) return false
    throw new Error(`Cognito ${action} failed: ${response.status} ${text}`)
  }

  return {
    exists: (identity) => (identity.kind === 'cognito' && identity.username ? call('AdminGetUser', identity.username) : Promise.resolve(true)),
    remove: async (identity) => {
      if (identity.kind === 'cognito' && identity.username) await call('AdminDeleteUser', identity.username)
    },
  }
}
