import { DEFAULT_CENTER, DEFAULT_RADIUS_KM, type GeoPoint, MAX_RADIUS_KM } from '@civic/core'
import { schema } from '@civic/db'
import { eq } from 'drizzle-orm'
import type { Context } from '../context'
import { pageNotifications } from '../data/notifications'
import { filters, pagePosts } from '../data/posts'
import { apiError } from '../errors'
import { trending } from '../data/topics'
import { searchUsers, trustedSources } from '../data/users'
import { builder } from './builder'
import { FeedKind, GeoInput, NotificationConnection, NotificationRef, PostConnection, PostRef, TopicRef, TrendRef, UserRef } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const radius = (km: number | null | undefined) => Math.min(Math.max(km ?? DEFAULT_RADIUS_KM, 0.5), MAX_RADIUS_KM)
const limit = (n: number | null | undefined, max: number) => Math.min(Math.max(n ?? 5, 1), max)

const notificationScope = async (ctx: Context, { near, radiusKm }: { near?: GeoPoint | null; radiusKm?: number | null }) => ({
  viewerId: (await ctx.viewer())?.id ?? null,
  near: near ?? undefined,
  radiusKm: near ? radius(radiusKm) : undefined,
})

builder.queryType({
  fields: (t) => ({
    viewer: t.field({
      type: UserRef,
      nullable: true,
      description: 'The signed-in user, or null for anonymous requests.',
      resolve: (_root, _args, ctx) => ctx.viewer(),
    }),

    feed: t.connection(
      {
        type: PostRef,
        args: {
          kind: t.arg({ type: FeedKind, defaultValue: 'FOR_YOU' }),
          near: t.arg({ type: GeoInput, description: 'Defaults to the metro centre for NEARBY.' }),
          radiusKm: t.arg.float(),
        },
        resolve: async (_root, args, ctx) => {
          switch (args.kind ?? 'FOR_YOU') {
            case 'NEARBY':
              return pagePosts(ctx.db, filters.nearby(args.near ?? DEFAULT_CENTER, radius(args.radiusKm)), args)
            case 'FOLLOWING': {
              const viewer = await ctx.requireViewer()
              return pagePosts(ctx.db, filters.following(viewer.id), args)
            }
            default:
              return pagePosts(ctx.db, filters.topLevel(), args)
          }
        },
      },
      PostConnection,
    ),

    notifications: t.connection(
      {
        type: NotificationRef,
        description:
          'Official alerts and advisories near a point (plus citywide ones) and, when signed in, replies, likes, reposts and follows from other people. Newest first.',
        args: { near: t.arg({ type: GeoInput }), radiusKm: t.arg.float() },
        resolve: async (_root, args, ctx) => pageNotifications(ctx.db, await notificationScope(ctx, args), args),
      },
      NotificationConnection,
    ),

    latestNotificationAt: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'When the newest of `notifications` with the same arguments happened, or null if there are none. Enough for an unread marker without loading the list.',
      args: { near: t.arg({ type: GeoInput }), radiusKm: t.arg.float() },
      resolve: async (_root, args, ctx) => {
        const { edges } = await pageNotifications(ctx.db, await notificationScope(ctx, args), { first: 1 })
        return edges[0]?.node.createdAt ?? null
      },
    }),

    search: t.connection(
      {
        type: PostRef,
        args: { query: t.arg.string({ required: true }) },
        resolve: (_root, args, ctx) => {
          const query = args.query.trim()
          if (query.length < 2) throw apiError('BAD_USER_INPUT', 'Search needs at least 2 characters')
          return pagePosts(ctx.db, filters.search(query), args)
        },
      },
      PostConnection,
    ),

    savedPosts: t.connection(
      {
        type: PostRef,
        resolve: async (_root, args, ctx) => {
          const viewer = await ctx.requireViewer()
          return pagePosts(ctx.db, filters.savedBy(ctx.db, viewer.id), args)
        },
      },
      PostConnection,
    ),

    post: t.field({
      type: PostRef,
      nullable: true,
      args: { id: t.arg.id({ required: true }) },
      resolve: (_root, { id }, ctx) => (UUID.test(String(id)) ? ctx.loaders.post.load(String(id)) : null),
    }),

    user: t.field({
      type: UserRef,
      nullable: true,
      args: { handle: t.arg.string({ required: true }) },
      resolve: async (_root, { handle }, ctx) => {
        // Handles are stored lowercase (users_handle_lowercase), so lookups are case-insensitive.
        const [row] = await ctx.db.select().from(schema.users).where(eq(schema.users.handle, handle.replace(/^@/, '').toLowerCase()))
        if (row) ctx.loaders.user.prime(row.id, row)
        return row ?? null
      },
    }),

    searchUsers: t.field({
      type: [UserRef],
      args: { query: t.arg.string({ required: true }), first: t.arg.int() },
      resolve: (_root, args, ctx) => searchUsers(ctx.db, args.query, limit(args.first, 20)),
    }),

    topic: t.field({
      type: TopicRef,
      nullable: true,
      args: { slug: t.arg.string({ required: true }) },
      resolve: async (_root, { slug }, ctx) => {
        const [row] = await ctx.db.select().from(schema.topics).where(eq(schema.topics.slug, slug.replace(/^#/, '').toLowerCase()))
        return row ?? null
      },
    }),

    trends: t.field({
      type: [TrendRef],
      args: { first: t.arg.int() },
      resolve: (_root, args, ctx) => trending(ctx.db, limit(args.first, 20)),
    }),

    trustedSources: t.field({
      type: [UserRef],
      args: { first: t.arg.int() },
      resolve: async (_root, args, ctx) => trustedSources(ctx.db, (await ctx.viewer())?.id ?? null, limit(args.first, 20)),
    }),
  }),
})
