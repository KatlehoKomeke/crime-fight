import Constants from 'expo-constants'
import { Platform } from 'react-native'

export type SsoProvider = 'google' | 'apple'

export interface RuntimeConfig {
  stage: string
  /** Endpoint the client talks to (same-origin `/graphql` on deployed web). */
  apiUrl: string
  siteUrl: string
  authMode: 'dev' | 'cognito'
  cognitoDomain: string | null
  cognitoClientId: string | null
  /** Sign-in providers enabled on the Cognito app client, in display order. */
  ssoProviders: SsoProvider[]
  persistedQueries: boolean
  /**
   * Inbox events: the AppSync Events WebSocket endpoint and the HTTP host its
   * handshake names. Locally the dev API serves the same protocol. Null turns
   * live updates off; messages still load from the API.
   */
  realtime: { url: string; host: string } | null
}

export const isServer = Platform.OS === 'web' && typeof window === 'undefined'

const parseSsoProviders = (raw: string | undefined): SsoProvider[] =>
  (raw ?? '').split(',').filter((p): p is SsoProvider => p === 'google' || p === 'apple')

/** Explicit settings win; the local dev API serves realtime next to /graphql. */
function realtimeConfig(url: string | undefined, host: string | undefined, localApiUrl: string | null): RuntimeConfig['realtime'] {
  if (url && host) return { url, host }
  if (!localApiUrl?.startsWith('http')) return null
  const api = new URL(localApiUrl)
  return { url: `${api.protocol === 'https:' ? 'wss' : 'ws'}://${api.host}/event/realtime`, host: api.host }
}

/**
 * Server-side (SSR Lambda / dev server) config read at request time, so one
 * web build can be promoted from QA to prod unchanged.
 */
export function serverConfig(): RuntimeConfig {
  const env = process.env
  const stage = env.CIVIC_STAGE ?? 'local'
  const apiUrl = env.CIVIC_PUBLIC_API_URL ?? (stage === 'local' ? 'http://localhost:4000/graphql' : '/graphql')
  return {
    stage,
    apiUrl,
    siteUrl: env.CIVIC_SITE_URL ?? 'http://localhost:8081',
    authMode: env.CIVIC_AUTH_MODE === 'cognito' ? 'cognito' : 'dev',
    cognitoDomain: env.CIVIC_COGNITO_DOMAIN ?? null,
    cognitoClientId: env.CIVIC_COGNITO_CLIENT_ID ?? null,
    ssoProviders: parseSsoProviders(env.CIVIC_SSO_PROVIDERS),
    persistedQueries: env.CIVIC_PERSISTED_QUERIES === 'true',
    realtime: realtimeConfig(env.CIVIC_REALTIME_URL, env.CIVIC_REALTIME_HOST, stage === 'local' ? apiUrl : null),
  }
}

/** Absolute API URL for server-to-server fetches from route loaders. */
export function serverApiUrl(): string {
  return process.env.CIVIC_API_INTERNAL_URL ?? 'http://localhost:4000/graphql'
}

function nativeConfig(): RuntimeConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as Partial<Record<string, string>>
  // In development, reach the API on the same machine that serves the JS bundle.
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost'
  const apiUrl = extra.apiUrl ?? `http://${devHost}:4000/graphql`
  return {
    stage: extra.stage ?? 'local',
    apiUrl,
    siteUrl: extra.siteUrl ?? `http://${devHost}:8081`,
    authMode: extra.authMode === 'cognito' ? 'cognito' : 'dev',
    cognitoDomain: extra.cognitoDomain ?? null,
    cognitoClientId: extra.cognitoClientId ?? null,
    ssoProviders: parseSsoProviders(extra.ssoProviders),
    persistedQueries: !__DEV__,
    realtime: realtimeConfig(extra.realtimeUrl, extra.realtimeHost, (extra.stage ?? 'local') === 'local' ? apiUrl : null),
  }
}

let cached: RuntimeConfig | undefined

export function getConfig(): RuntimeConfig {
  if (Platform.OS !== 'web') return (cached ??= nativeConfig())
  if (isServer) return serverConfig()
  return (cached ??= window.__CIVIC_CONFIG__ ?? serverConfig())
}
