import type { Database, User } from '@civic/db'
import type { YogaInitialContext } from 'graphql-yoga'
import type { Authenticator, Identity } from './auth'
import { createLoaders, type Loaders } from './data/loaders'
import { resolveViewer } from './data/users'
import { apiError } from './errors'
import type { Payments } from './payments'
import type { Publisher } from './realtime/publisher'
import type { SignIns } from './sign-ins'

export interface Context {
  db: Database
  identity: Identity | null
  signIns: SignIns
  /** Lazily resolved (and provisioned on first sign-in); costs nothing for anonymous requests. */
  viewer: () => Promise<User | null>
  requireViewer: () => Promise<User>
  /** Admins review bounties and release money. Configured by handle (ADMIN_HANDLES), never a public role. */
  isAdmin: () => Promise<boolean>
  requireAdmin: () => Promise<User>
  /** Who the admins are, so the money layer can tell them when a claim needs them. */
  adminHandles: ReadonlySet<string>
  loaders: Loaders
  realtime: Publisher
  payments: Payments
  /** This request as another user sees it, with their own loaders: resolves each recipient's copy of a realtime event. */
  as: (user: User) => Context
}

interface Services {
  db: Database
  realtime: Publisher
  signIns: SignIns
  payments: Payments
  adminHandles: Set<string>
}

function buildContext(services: Services, identity: Identity | null, resolve: () => Promise<User | null>): Context {
  let viewerPromise: Promise<User | null> | undefined
  const viewer = () => (viewerPromise ??= resolve())
  const requireViewer = async () => {
    const user = await viewer()
    if (!user) throw apiError('UNAUTHENTICATED', 'Sign in to do that')
    return user
  }
  const isAdmin = async () => {
    const user = await viewer()
    return Boolean(user && services.adminHandles.has(user.handle))
  }
  const requireAdmin = async () => {
    const user = await requireViewer()
    if (!services.adminHandles.has(user.handle)) throw apiError('FORBIDDEN', 'Only CIVIC/ONE admins can do that')
    return user
  }

  return {
    db: services.db,
    identity,
    signIns: services.signIns,
    viewer,
    requireViewer,
    isAdmin,
    requireAdmin,
    adminHandles: services.adminHandles,
    loaders: createLoaders(services.db, async () => (await viewer())?.id ?? null),
    realtime: services.realtime,
    payments: services.payments,
    as: (user) => buildContext(services, null, () => Promise.resolve(user)),
  }
}

export function createContextFactory(services: Services, authenticate: Authenticator) {
  return async ({ request }: YogaInitialContext): Promise<Context> => {
    const identity = await authenticate(request)
    if (identity === 'invalid') {
      throw apiError('UNAUTHENTICATED', 'Your session has expired. Please sign in again.', { http: { status: 401 } })
    }
    return buildContext(services, identity, () => (identity ? resolveViewer(services.db, identity, services.signIns, services.adminHandles) : Promise.resolve(null)))
  }
}
