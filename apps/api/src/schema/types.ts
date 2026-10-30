import { ALERT_SEVERITIES, initialsFor, POST_KINDS, TRUST_BADGES, trustBadgeFor, USER_ROLES } from '@civic/core'
import type { Post, PostMedia, Topic, User } from '@civic/db'
import type { Trend } from '../data/topics'
import { filters, pagePosts, pageReplies } from '../data/posts'
import { builder } from './builder'

export const PostKind = builder.enumType('PostKind', { values: POST_KINDS })
export const AlertSeverity = builder.enumType('AlertSeverity', { values: ALERT_SEVERITIES })
export const UserRole = builder.enumType('UserRole', { values: USER_ROLES })
export const TrustBadge = builder.enumType('TrustBadge', {
  values: TRUST_BADGES,
  description: 'Derived from the author’s verified role; cannot be set by the author.',
})
export const FeedKind = builder.enumType('FeedKind', { values: ['FOR_YOU', 'NEARBY', 'FOLLOWING'] as const })

export const GeoPoint = builder.objectRef<{ lat: number; lng: number }>('GeoPoint').implement({
  fields: (t) => ({ lat: t.exposeFloat('lat'), lng: t.exposeFloat('lng') }),
})

export const GeoInput = builder.inputType('GeoInput', {
  fields: (t) => ({ lat: t.float({ required: true }), lng: t.float({ required: true }) }),
})

export const UserRef = builder.objectRef<User>('User')
export const PostRef = builder.objectRef<Post>('Post')
export const TopicRef = builder.objectRef<Topic>('Topic')
export const MediaRef = builder.objectRef<PostMedia>('Media')
export const TrendRef = builder.objectRef<Trend>('Trend')

export const PostConnection = builder.connectionObject({ type: PostRef, name: 'PostConnection' }, { name: 'PostEdge' })

UserRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    handle: t.exposeString('handle'),
    displayName: t.exposeString('displayName'),
    initials: t.string({ resolve: (user) => initialsFor(user.displayName) }),
    bio: t.exposeString('bio'),
    avatarUrl: t.exposeString('avatarUrl', { nullable: true }),
    role: t.field({ type: UserRole, resolve: (user) => user.role }),
    verified: t.boolean({ resolve: (user) => user.verifiedAt !== null }),
    trustBadge: t.field({
      type: TrustBadge,
      nullable: true,
      resolve: (user) => trustBadgeFor(user.role, user.verifiedAt !== null),
    }),
    createdAt: t.field({ type: 'DateTime', resolve: (user) => user.createdAt }),
    followerCount: t.int({ resolve: (user, _, ctx) => ctx.loaders.followerCount.load(user.id) }),
    followingCount: t.int({ resolve: (user, _, ctx) => ctx.loaders.followingCount.load(user.id) }),
    postCount: t.int({ resolve: (user, _, ctx) => ctx.loaders.postCount.load(user.id) }),
    viewerIsFollowing: t.boolean({ resolve: (user, _, ctx) => ctx.loaders.following.load(user.id) }),
    isViewer: t.boolean({ resolve: async (user, _, ctx) => (await ctx.viewer())?.id === user.id }),
    posts: t.connection({ type: PostRef, resolve: (user, args, ctx) => pagePosts(ctx.db, filters.byAuthor(user.id), args) }, PostConnection),
  }),
})

PostRef.implement({
  description: 'A community update, official alert/advisory, or a reply.',
  fields: (t) => ({
    id: t.exposeID('id'),
    body: t.exposeString('body'),
    kind: t.field({ type: PostKind, resolve: (post) => post.kind }),
    severity: t.field({ type: AlertSeverity, nullable: true, resolve: (post) => post.severity }),
    area: t.exposeString('area', { nullable: true }),
    category: t.exposeString('category', { nullable: true }),
    location: t.field({
      type: GeoPoint,
      nullable: true,
      resolve: (post) => (post.lat != null && post.lng != null ? { lat: post.lat, lng: post.lng } : null),
    }),
    createdAt: t.field({ type: 'DateTime', resolve: (post) => post.createdAt }),
    replyCount: t.exposeInt('replyCount'),
    likeCount: t.exposeInt('likeCount'),
    repostCount: t.exposeInt('repostCount'),
    author: t.field({
      type: UserRef,
      resolve: async (post, _, ctx) => {
        const author = await ctx.loaders.user.load(post.authorId)
        if (!author) throw new Error(`Author ${post.authorId} missing`)
        return author
      },
    }),
    trustBadge: t.field({
      type: TrustBadge,
      nullable: true,
      resolve: async (post, _, ctx) => {
        const author = await ctx.loaders.user.load(post.authorId)
        return author ? trustBadgeFor(author.role, author.verifiedAt !== null) : null
      },
    }),
    viewerHasLiked: t.boolean({ resolve: (post, _, ctx) => ctx.loaders.liked.load(post.id) }),
    viewerHasSaved: t.boolean({ resolve: (post, _, ctx) => ctx.loaders.saved.load(post.id) }),
    viewerHasReposted: t.boolean({ resolve: (post, _, ctx) => ctx.loaders.reposted.load(post.id) }),
    viewerCanDelete: t.boolean({ resolve: async (post, _, ctx) => (await ctx.viewer())?.id === post.authorId }),
    replyTo: t.field({
      type: PostRef,
      nullable: true,
      resolve: (post, _, ctx) => (post.replyToId ? ctx.loaders.post.load(post.replyToId) : null),
    }),
    replies: t.connection({ type: PostRef, resolve: (post, args, ctx) => pageReplies(ctx.db, post.id, args) }, PostConnection),
    media: t.field({ type: [MediaRef], resolve: (post, _, ctx) => ctx.loaders.media.load(post.id) }),
    topics: t.field({ type: [TopicRef], resolve: (post, _, ctx) => ctx.loaders.topics.load(post.id) }),
  }),
})

TopicRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    slug: t.exposeString('slug'),
    title: t.exposeString('title'),
    category: t.exposeString('category'),
    posts: t.connection({ type: PostRef, resolve: (topic, args, ctx) => pagePosts(ctx.db, filters.topic(ctx.db, topic.slug), args) }, PostConnection),
  }),
})

MediaRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    url: t.exposeString('url'),
    alt: t.exposeString('alt'),
    caption: t.exposeString('caption', { nullable: true }),
    width: t.exposeInt('width', { nullable: true }),
    height: t.exposeInt('height', { nullable: true }),
  }),
})

TrendRef.implement({
  fields: (t) => ({
    topic: t.field({ type: TopicRef, resolve: (trend) => trend.topic }),
    postCount: t.exposeInt('postCount'),
  }),
})

export const CreatePostInput = builder.inputType('CreatePostInput', {
  fields: (t) => ({
    body: t.string({ required: true }),
    kind: t.field({ type: PostKind, description: 'ALERT and ADVISORY require a verified official or newsroom account.' }),
    severity: t.field({ type: AlertSeverity }),
    area: t.string(),
    category: t.string(),
    location: t.field({ type: GeoInput, description: 'Coarsened to ~1 km unless the author is a verified official.' }),
    replyToId: t.id(),
  }),
})

export const UpdateProfileInput = builder.inputType('UpdateProfileInput', {
  fields: (t) => ({ displayName: t.string(), bio: t.string() }),
})
