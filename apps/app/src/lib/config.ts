import Constants from 'expo-constants'
import { Platform } from 'react-native'

export interface RuntimeConfig {
  stage: string
  /** Endpoint the client talks to (same-origin `/graphql` on deployed web). */
  apiUrl: string
  siteUrl: string
  authMode: 'dev' | 'cognito'
  cognitoDomain: string | null
  cognitoClientId: string | null
  persistedQueries: boolean
}

export const isServer = Platform.OS === 'web' && typeof window === 'undefined'

/**
 * Server-side (SSR Lambda / dev server) config read at request time, so one
 * web build can be promoted from QA to prod unchanged.
 */
export function serverConfig(): RuntimeConfig {
  const env = process.env
  const stage = env.CIVIC_STAGE ?? 'local'
  return {
    stage,
    apiUrl: env.CIVIC_PUBLIC_API_URL ?? (stage === 'local' ? 'http://localhost:4000/graphql' : '/graphql'),
    siteUrl: env.CIVIC_SITE_URL ?? 'http://localhost:8081',
    authMode: env.CIVIC_AUTH_MODE === 'cognito' ? 'cognito' : 'dev',
    cognitoDomain: env.CIVIC_COGNITO_DOMAIN ?? null,
    cognitoClientId: env.CIVIC_COGNITO_CLIENT_ID ?? null,
    persistedQueries: env.CIVIC_PERSISTED_QUERIES === 'true',
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
  return {
    stage: extra.stage ?? 'local',
    apiUrl: extra.apiUrl ?? `http://${devHost}:4000/graphql`,
    siteUrl: extra.siteUrl ?? `http://${devHost}:8081`,
    authMode: extra.authMode === 'cognito' ? 'cognito' : 'dev',
    cognitoDomain: extra.cognitoDomain ?? null,
    cognitoClientId: extra.cognitoClientId ?? null,
    persistedQueries: !__DEV__,
  }
}

let cached: RuntimeConfig | undefined

export function getConfig(): RuntimeConfig {
  if (Platform.OS !== 'web') return (cached ??= nativeConfig())
  if (isServer) return serverConfig()
  return (cached ??= window.__CIVIC_CONFIG__ ?? serverConfig())
}
