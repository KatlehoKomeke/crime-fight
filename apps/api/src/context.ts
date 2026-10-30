import type { Database, User } from '@civic/db'
import type { YogaInitialContext } from 'graphql-yoga'
import type { Authenticator, Identity } from './auth'
import { createLoaders, type Loaders } from './data/loaders'
import { resolveViewer } from './data/users'
import { apiError } from './errors'

export interface Context {
  db: Database
  identity: Identity | null
  /** Lazily resolved (and provisioned on first sign-in); costs nothing for anonymous requests. */
  viewer: () => Promise<User | null>
  requireViewer: () => Promise<User>
  loaders: Loaders
}

export function createContextFactory(db: Database, authenticate: Authenticator) {
  return async ({ request }: YogaInitialContext): Promise<Context> => {
    const identity = await authenticate(request)
    if (identity === 'invalid') {
      throw apiError('UNAUTHENTICATED', 'Your session has expired. Please sign in again.', { http: { status: 401 } })
    }

    let viewerPromise: Promise<User | null> | undefined
    const viewer = () => (viewerPromise ??= identity ? resolveViewer(db, identity) : Promise.resolve(null))
    const requireViewer = async () => {
      const user = await viewer()
      if (!user) throw apiError('UNAUTHENTICATED', 'Sign in to do that')
      return user
    }

    return {
      db,
      identity,
      viewer,
      requireViewer,
      loaders: createLoaders(db, async () => (await viewer())?.id ?? null),
    }
  }
}
