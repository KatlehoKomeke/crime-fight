import { CognitoJwtVerifier } from 'aws-jwt-verify'
import type { ApiEnv } from './env'

export type Identity =
  | { kind: 'cognito'; sub: string; email?: string; name?: string; preferredUsername?: string }
  | { kind: 'dev'; handle: string }

/** `null` = anonymous request, `'invalid'` = a token was sent but failed verification. */
export type Authenticator = (request: Request) => Promise<Identity | null | 'invalid'>

export function createAuthenticator(env: ApiEnv): Authenticator {
  if (env.authMode === 'dev') {
    return (request) => {
      const handle = request.headers.get('x-dev-user')?.trim()
      return Promise.resolve(handle ? { kind: 'dev', handle } : null)
    }
  }

  if (!env.cognitoUserPoolId) throw new Error('COGNITO_USER_POOL_ID is required when AUTH_MODE=cognito')
  // JWKS are fetched once per Lambda container and cached by aws-jwt-verify.
  // Without COGNITO_CLIENT_IDS any app client of *our* user pool is accepted;
  // the web client is created after CloudFront, so pinning it here would form
  // a CloudFormation dependency cycle (see infra/lib/stacks/web-stack.ts).
  const verifier = CognitoJwtVerifier.create({
    userPoolId: env.cognitoUserPoolId,
    tokenUse: 'id',
    clientId: env.cognitoClientIds.length ? env.cognitoClientIds : null,
  })

  return async (request) => {
    const header = request.headers.get('authorization')
    if (!header?.startsWith('Bearer ')) return null
    try {
      const claims = await verifier.verify(header.slice('Bearer '.length))
      return {
        kind: 'cognito',
        sub: claims.sub,
        email: typeof claims.email === 'string' ? claims.email : undefined,
        name: typeof claims.name === 'string' ? claims.name : undefined,
        preferredUsername: typeof claims.preferred_username === 'string' ? claims.preferred_username : undefined,
      }
    } catch {
      // Surfaced as a 401 so clients refresh their session instead of silently browsing logged out.
      return 'invalid'
    }
  }
}
