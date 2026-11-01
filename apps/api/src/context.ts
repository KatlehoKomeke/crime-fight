import type { Database, User } from '@civic/db'
import type { YogaInitialContext } from 'graphql-yoga'
import type { Authenticator, Identity } from './auth'
import { createLoaders, type Loaders } from './data/loaders'
import { resolveViewer } from './data/users'
import { apiError } from './errors'
import type { Publisher } from './realtime/publisher'

export interface Context {
  db: Database
  identity: Identity | null
  /** Lazily resolved (and provisioned on first sign-in); costs nothing for anonymous requests. */
  viewer: () => Promise<User | null>
  requireViewer: () => Promise<User>
  loaders: Loaders
  realtime: Publisher
  /** This request as another user sees it, with their own loaders: resolves each recipient's copy of a realtime event. */
  as: (user: User) => Context
}

function buildContext(db: Database, realtime: Publisher, identity: Identity | null, resolve: () => Promise<User | null>): Context {
  let viewerPromise: Promise<User | null> | undefined
  const viewer = () => (viewerPromise ??= resolve())
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
    realtime,
    as: (user) => buildContext(db, realtime, null, () => Promise.resolve(user)),
  }
}

export function createContextFactory(db: Database, authenticate: Authenticator, realtime: Publisher) {
  return async ({ request }: YogaInitialContext): Promise<Context> => {
    const identity = await authenticate(request)
    if (identity === 'invalid') {
      throw apiError('UNAUTHENTICATED', 'Your session has expired. Please sign in again.', { http: { status: 401 } })
    }
    return buildContext(db, realtime, identity, () => (identity ? resolveViewer(db, identity) : Promise.resolve(null)))
  }
}
