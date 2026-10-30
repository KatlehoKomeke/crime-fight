import type { Cache, CacheExchangeOpts } from '@urql/exchange-graphcache'
import { relayPagination } from '@urql/exchange-graphcache/extras'

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

const follow = (args: Args, cache: Cache, on: boolean) => {
  const ref = { __typename: 'User', id: args.id }
  const followerCount = nextCount(Number(cache.resolve(ref, 'followerCount') ?? 0), Boolean(cache.resolve(ref, 'viewerIsFollowing')), on)
  return { __typename: 'User', id: args.id, viewerIsFollowing: on, followerCount }
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
  },
  resolvers: {
    Query: {
      feed: relayPagination(),
      alerts: relayPagination(),
      search: relayPagination(),
      savedPosts: relayPagination(),
      post: (_parent, args) => ({ __typename: 'Post', id: args.id as string }),
    },
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
    Mutation: {
      createPost: (result, _args, cache) => {
        const post = result.createPost as { replyTo?: { id: string } | null } | undefined
        if (post?.replyTo) cache.invalidate({ __typename: 'Post', id: post.replyTo.id }, 'replies')
        invalidateField(cache, 'Query', 'feed')
        invalidateField(cache, 'Query', 'alerts')
      },
      deletePost: (_result, args, cache) => cache.invalidate({ __typename: 'Post', id: (args as Args).id }),
      savePost: (_result, _args, cache) => invalidateField(cache, 'Query', 'savedPosts'),
      unsavePost: (_result, _args, cache) => invalidateField(cache, 'Query', 'savedPosts'),
      followUser: (_result, _args, cache) => invalidateField(cache, 'Query', 'trustedSources'),
    },
  },
}
