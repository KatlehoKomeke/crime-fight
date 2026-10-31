import * as AuthSession from 'expo-auth-session'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getConfig, isServer, type SsoProvider } from './config'
import type { AuthBridge } from './graphql/client'
import { storage } from './storage'

type Session =
  | { kind: 'dev'; handle: string }
  | { kind: 'cognito'; sub: string; idToken: string; expiresAt: number }

interface AuthContextValue {
  status: 'loading' | 'signed-out' | 'signed-in'
  session: Session | null
  /** Stable key that changes whenever the signed-in identity changes. */
  identity: string
  bridge: AuthBridge
  mode: 'dev' | 'cognito'
  /** How the current session signed in; null when signed out. */
  method: SsoProvider | 'dev' | null
  /**
   * Dev mode signs in as a seeded handle; Cognito mode goes to an SSO provider.
   * Resolves false when the user closes the provider's window.
   */
  signIn: (via: { devHandle: string } | { provider: SsoProvider }) => Promise<boolean>
  signOut: () => Promise<void>
}

const SESSION_KEY = 'civic.session.v1'
const REFRESH_KEY = 'civic.refresh.v1'

/** Cognito's names for the providers; `identity_provider` skips the managed login page. */
const COGNITO_IDP: Record<SsoProvider, string> = { google: 'Google', apple: 'SignInWithApple' }

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

interface IdTokenClaims {
  sub: string
  exp: number
  /** Present on federated sign-ins, e.g. [{ providerName: 'Google' }]. */
  identities?: Array<{ providerName?: string }>
}

function decodeJwt(token: string): IdTokenClaims {
  const payload = token.split('.')[1] ?? ''
  const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='))
  return JSON.parse(json) as IdTokenClaims
}

function methodOf(session: Session | null): AuthContextValue['method'] {
  if (!session) return null
  if (session.kind === 'dev') return 'dev'
  const provider = decodeJwt(session.idToken).identities?.[0]?.providerName
  const match = (Object.entries(COGNITO_IDP) as Array<[SsoProvider, string]>).find(([, name]) => name === provider)
  return match?.[0] ?? null
}

function sessionFromTokens(tokens: AuthSession.TokenResponse): Session {
  if (!tokens.idToken) throw new Error('Cognito did not return an ID token')
  const claims = decodeJwt(tokens.idToken)
  return { kind: 'cognito', sub: claims.sub, idToken: tokens.idToken, expiresAt: claims.exp * 1000 }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const config = getConfig()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  // Read by the urql auth exchange. Updated together with state (not in an
  // effect) so the very first request after sign-in already carries the token.
  const sessionRef = useRef<Session | null>(null)
  const applySession = useCallback((next: Session | null) => {
    sessionRef.current = next
    setSession(next)
  }, [])

  const discovery = useMemo<AuthSession.DiscoveryDocument | null>(
    () =>
      config.cognitoDomain
        ? {
            authorizationEndpoint: `https://${config.cognitoDomain}/oauth2/authorize`,
            tokenEndpoint: `https://${config.cognitoDomain}/oauth2/token`,
            revocationEndpoint: `https://${config.cognitoDomain}/oauth2/revoke`,
            endSessionEndpoint: `https://${config.cognitoDomain}/logout`,
          }
        : null,
    [config.cognitoDomain],
  )
  // makeRedirectUri reads window.location on web, so it must not run during SSR.
  const redirectUri = useMemo(() => (isServer ? '' : AuthSession.makeRedirectUri({ path: 'auth/callback' })), [])
  // One prepared request per provider: on web the popup must open synchronously
  // inside the click handler, so the authorize URL can't be built on demand.
  const requestFor = (provider: SsoProvider): AuthSession.AuthRequestConfig => ({
    clientId: config.cognitoClientId ?? 'unconfigured',
    redirectUri,
    scopes: ['openid', 'email', 'profile'],
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
    extraParams: { identity_provider: COGNITO_IDP[provider] },
  })
  const cognitoDiscovery = config.authMode === 'cognito' ? discovery : null
  const [googleRequest, , promptGoogle] = AuthSession.useAuthRequest(requestFor('google'), cognitoDiscovery)
  const [appleRequest, , promptApple] = AuthSession.useAuthRequest(requestFor('apple'), cognitoDiscovery)

  const persist = useCallback(
    async (next: Session | null, refreshToken?: string | null) => {
      applySession(next)
      if (next) await storage.set(SESSION_KEY, JSON.stringify(next))
      else await storage.remove(SESSION_KEY)
      if (refreshToken) await storage.set(REFRESH_KEY, refreshToken)
      if (!next) await storage.remove(REFRESH_KEY)
    },
    [applySession],
  )

  useEffect(() => {
    storage
      .get(SESSION_KEY)
      .then((raw) => raw && applySession(JSON.parse(raw) as Session))
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [applySession])

  const bridge = useMemo<AuthBridge>(
    () => ({
      headers: (): Record<string, string> => {
        const current = sessionRef.current
        if (!current) return {}
        return current.kind === 'dev' ? { 'x-dev-user': current.handle } : { authorization: `Bearer ${current.idToken}` }
      },
      isExpiringSoon: () => {
        const current = sessionRef.current
        return current?.kind === 'cognito' && current.expiresAt - Date.now() < 60_000
      },
      refresh: async () => {
        const refreshToken = await storage.get(REFRESH_KEY)
        if (!discovery || !refreshToken || !config.cognitoClientId) return persist(null)
        try {
          const tokens = await AuthSession.refreshAsync({ clientId: config.cognitoClientId, refreshToken }, discovery)
          await persist(sessionFromTokens(tokens), tokens.refreshToken)
        } catch {
          await persist(null)
        }
      },
    }),
    [config.cognitoClientId, discovery, persist],
  )

  const signIn = useCallback(
    async (via: { devHandle: string } | { provider: SsoProvider }) => {
      if (config.authMode === 'dev') {
        await persist({ kind: 'dev', handle: 'devHandle' in via ? via.devHandle : 'alexm' })
        return true
      }
      if (!('provider' in via) || !config.ssoProviders.includes(via.provider)) throw new Error('That sign-in option isn’t available')
      const [request, promptAsync] = via.provider === 'google' ? [googleRequest, promptGoogle] : [appleRequest, promptApple]
      if (!request || !discovery || !config.cognitoClientId) throw new Error('Sign-in is not configured for this environment')
      const result = await promptAsync()
      if (result.type !== 'success') return false
      const tokens = await AuthSession.exchangeCodeAsync(
        { clientId: config.cognitoClientId, code: result.params.code!, redirectUri, extraParams: { code_verifier: request.codeVerifier ?? '' } },
        discovery,
      )
      await persist(sessionFromTokens(tokens), tokens.refreshToken)
      return true
    },
    [appleRequest, config.authMode, config.cognitoClientId, config.ssoProviders, discovery, googleRequest, persist, promptApple, promptGoogle, redirectUri],
  )

  const signOut = useCallback(async () => {
    const refreshToken = await storage.get(REFRESH_KEY)
    if (discovery?.revocationEndpoint && refreshToken && config.cognitoClientId) {
      await AuthSession.revokeAsync({ token: refreshToken, clientId: config.cognitoClientId }, discovery).catch(() => undefined)
    }
    await persist(null)
  }, [config.cognitoClientId, discovery, persist])

  const value = useMemo<AuthContextValue>(() => {
    let identity = 'anon'
    if (session?.kind === 'dev') identity = `dev:${session.handle}`
    else if (session?.kind === 'cognito') identity = `cognito:${session.sub}`
    return {
      status: loading ? 'loading' : session ? 'signed-in' : 'signed-out',
      session,
      identity,
      bridge,
      mode: config.authMode,
      method: methodOf(session),
      signIn,
      signOut,
    }
  }, [bridge, config.authMode, loading, session, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
