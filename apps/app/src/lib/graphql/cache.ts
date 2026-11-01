import type { InboxEventFieldsFragment } from '@civic/graphql'
import type { Cache, CacheExchangeOpts } from '@urql/exchange-graphcache'
import { relayPagination } from '@urql/exchange-graphcache/extras'
import { ConversationQuery } from '@/graphql/documents'

type Args = { id: string }

const invalidateField = (cache: Cache, typename: string, field: string) => {
  for (const info of cache.inspectFields(typename)) {
    if (info.fieldName === field) cache.invalidate(typename, info.fieldName, info.arguments ?? undefined)
  }
}

/** Counter after a toggle; unchanged if the flag already had that value (repeat taps). */
const nextCount = (count: number, was: boolean, on: boolean) => {
  if (was === on) return count
  return Math.max(0, count + (on ? 1 : -1))
}

/** Optimistic toggle: flip the flag and nudge the counter before the server answers. */
const toggle = (flag: string, counter: string | null, on: boolean) => (args: Args, cache: Cache) => {
  const ref = { __typename: 'Post', id: args.id }
  const result: Record<string, unknown> = { __typename: 'Post', id: args.id, [flag]: on }
  if (counter) {
    result[counter] = nextCount(Number(cache.resolve(ref, counter) ?? 0), Boolean(cache.resolve(ref, flag)), on)
  }
  return result
}

/** When the first item of a cached Notifications page happened; null if the page is empty. */
const newestNotification = (cache: Cache, fieldKey: string) => {
  const connection = cache.resolve('Query', fieldKey) as string | null
  const edges = (connection ? cache.resolve(connection, 'edges') : null) as string[] | null
  const node = edges?.[0] ? (cache.resolve(edges[0], 'node') as string | null) : null
  return node ? (cache.resolve(node, 'createdAt') as string | null) : null
}

const follow = (args: Args, cache: Cache, on: boolean) => {
  const ref = { __typename: 'User', id: args.id }
  const followerCount = nextCount(Number(cache.resolve(ref, 'followerCount') ?? 0), Boolean(cache.resolve(ref, 'viewerIsFollowing')), on)
  // Unfollowing always ends messaging; following only enables it if they follow back, which the server answers.
  const viewerCanMessage = on && Boolean(cache.resolve(ref, 'viewerCanMessage'))
  return { __typename: 'User', id: args.id, viewerIsFollowing: on, followerCount, viewerCanMessage }
}

/**
 * Applies an inbox event, whether it answers your own send or arrived over the
 * realtime channel. Conversation and badge counts update by normalisation; this
 * adds the new message to each cached first page of the thread, and refetches
 * the inbox only when it doesn't have that conversation yet. The inbox screen
 * sorts by latest activity itself, so existing rows need no reordering.
 */
const applyInboxEvent = (event: InboxEventFieldsFragment | null | undefined, cache: Cache) => {
  const edge = event?.messageEdge
  if (!event || !edge) return
  const conversation = { __typename: 'Conversation', id: event.conversation.id }

  for (const field of cache.inspectFields(conversation)) {
    if (field.fieldName !== 'messages' || field.arguments?.after) continue
    const variables = { ...(field.arguments as { first: number }), id: conversation.id }
    cache.updateQuery({ query: ConversationQuery, variables }, (data) => {
      const messages = data?.conversation?.messages
      // Your own send arrives twice (the mutation and your channel); add it once.
      if (!data?.conversation || !messages || messages.edges.some((e) => e.node.id === edge.node.id)) return data
      return { ...data, conversation: { ...data.conversation, messages: { ...messages, edges: [edge, ...messages.edges] } } }
    })
  }

  const key = cache.keyOfEntity(conversation)
  const inInbox = cache
    .inspectFields('Query')
    .filter((field) => field.fieldName === 'conversations')
    .some((field) => {
      const connection = cache.resolve('Query', field.fieldKey) as string | null
      const edges = (connection ? cache.resolve(connection, 'edges') : null) as string[] | null
      return edges?.some((edgeKey) => cache.resolve(edgeKey, 'node') === key)
    })
  if (!inInbox) invalidateField(cache, 'Query', 'conversations')
}

/**
 * Normalised cache: every Post/User is stored once by id, so liking a post in
 * the feed instantly updates it on the detail page and profile too, without
 * refetching anything.
 */
export const cacheConfig: CacheExchangeOpts = {
  keys: {
    GeoPoint: () => null,
    Trend: () => null,
    PageInfo: () => null,
    PostConnection: () => null,
    PostEdge: () => null,
    NotificationConnection: () => null,
    NotificationEdge: () => null,
    ConversationConnection: () => null,
    ConversationEdge: () => null,
    MessageConnection: () => null,
    MessageEdge: () => null,
    InboxEvent: () => null,
  },
  resolvers: {
    Query: {
      feed: relayPagination(),
      notifications: relayPagination(),
      search: relayPagination(),
      savedPosts: relayPagination(),
      conversations: relayPagination(),
      post: (_parent, args) => ({ __typename: 'Post', id: args.id as string }),
    },
    Conversation: { messages: relayPagination() },
    Post: { replies: relayPagination() },
    User: { posts: relayPagination() },
    Topic: { posts: relayPagination() },
  },
  optimistic: {
    likePost: toggle('viewerHasLiked', 'likeCount', true),
    unlikePost: toggle('viewerHasLiked', 'likeCount', false),
    repostPost: toggle('viewerHasReposted', 'repostCount', true),
    unrepostPost: toggle('viewerHasReposted', 'repostCount', false),
    savePost: toggle('viewerHasSaved', null, true),
    unsavePost: toggle('viewerHasSaved', null, false),
    followUser: (args, cache) => follow(args as Args, cache, true),
    unfollowUser: (args, cache) => follow(args as Args, cache, false),
  },
  updates: {
    Query: {
      // Something newer than a cached Notifications list starts with: refetch the list (right away if it's on screen).
      latestNotificationAt: (result, _args, cache) => {
        const latest = result.latestNotificationAt as string | null
        if (!latest) return
        const behind = cache.inspectFields('Query').some((field) => {
          if (field.fieldName !== 'notifications' || field.arguments?.after) return false
          const newest = newestNotification(cache, field.fieldKey)
          return !newest || Date.parse(latest) > Date.parse(newest)
        })
        if (behind) invalidateField(cache, 'Query', 'notifications')
      },
    },
    Mutation: {
      createPost: (result, _args, cache) => {
        const post = result.createPost as { replyTo?: { id: string } | null } | undefined
        if (post?.replyTo) cache.invalidate({ __typename: 'Post', id: post.replyTo.id }, 'replies')
        invalidateField(cache, 'Query', 'feed')
        invalidateField(cache, 'Query', 'notifications')
      },
      deletePost: (_result, args, cache) => cache.invalidate({ __typename: 'Post', id: (args as Args).id }),
      savePost: (_result, _args, cache) => invalidateField(cache, 'Query', 'savedPosts'),
      unsavePost: (_result, _args, cache) => invalidateField(cache, 'Query', 'savedPosts'),
      followUser: (_result, _args, cache) => invalidateField(cache, 'Query', 'trustedSources'),
      sendMessage: (result, _args, cache) => applyInboxEvent(result.sendMessage as InboxEventFieldsFragment, cache),
      markConversationRead: (result, _args, cache) => applyInboxEvent(result.markConversationRead as InboxEventFieldsFragment, cache),
    },
    Subscription: {
      inbox: (result, _args, cache) => applyInboxEvent(result.inbox as InboxEventFieldsFragment, cache),
    },
  },
}
