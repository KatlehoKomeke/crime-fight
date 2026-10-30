import { schema } from '@civic/db'
import type { Context } from '../context'
import { createPost, deletePost, setEdge, setFollow, updateProfile } from '../data/mutations'
import { apiError } from '../errors'
import { builder } from './builder'
import { CreatePostInput, PostRef, UpdateProfileInput, UserRef } from './types'

const { likes, saves, reposts } = schema

/** Re-reads the post after a write so counts and viewer flags in the response are fresh. */
async function freshPost(ctx: Context, id: string) {
  ctx.loaders.post.clear(id)
  ctx.loaders.liked.clear(id)
  ctx.loaders.saved.clear(id)
  ctx.loaders.reposted.clear(id)
  const post = await ctx.loaders.post.load(id)
  if (!post) throw apiError('NOT_FOUND', 'Post not found')
  return post
}

const edgeMutations = [
  ['likePost', likes, true],
  ['unlikePost', likes, false],
  ['savePost', saves, true],
  ['unsavePost', saves, false],
  ['repostPost', reposts, true],
  ['unrepostPost', reposts, false],
] as const

builder.mutationType({
  fields: (t) => ({
    createPost: t.field({
      type: PostRef,
      args: { input: t.arg({ type: CreatePostInput, required: true }) },
      resolve: async (_root, { input }, ctx) =>
        createPost(ctx.db, await ctx.requireViewer(), {
          body: input.body,
          kind: input.kind ?? undefined,
          severity: input.severity,
          area: input.area,
          category: input.category,
          location: input.location,
          replyToId: input.replyToId == null ? null : String(input.replyToId),
        }),
    }),

    deletePost: t.field({
      type: 'ID',
      args: { id: t.arg.id({ required: true }) },
      resolve: async (_root, { id }, ctx) => deletePost(ctx.db, await ctx.requireViewer(), String(id)),
    }),

    followUser: t.field({
      type: UserRef,
      args: { id: t.arg.id({ required: true }) },
      resolve: async (_root, { id }, ctx) => {
        await setFollow(ctx.db, await ctx.requireViewer(), String(id), true)
        ctx.loaders.following.clear(String(id))
        ctx.loaders.followerCount.clear(String(id))
        return (await ctx.loaders.user.load(String(id)))!
      },
    }),

    unfollowUser: t.field({
      type: UserRef,
      args: { id: t.arg.id({ required: true }) },
      resolve: async (_root, { id }, ctx) => {
        await setFollow(ctx.db, await ctx.requireViewer(), String(id), false)
        ctx.loaders.following.clear(String(id))
        ctx.loaders.followerCount.clear(String(id))
        const user = await ctx.loaders.user.load(String(id))
        if (!user) throw apiError('NOT_FOUND', 'User not found')
        return user
      },
    }),

    updateProfile: t.field({
      type: UserRef,
      args: { input: t.arg({ type: UpdateProfileInput, required: true }) },
      resolve: async (_root, { input }, ctx) =>
        updateProfile(ctx.db, await ctx.requireViewer(), {
          displayName: input.displayName ?? undefined,
          bio: input.bio ?? undefined,
        }),
    }),
  }),
})

for (const [name, table, on] of edgeMutations) {
  builder.mutationField(name, (t) =>
    t.field({
      type: PostRef,
      args: { id: t.arg.id({ required: true }) },
      resolve: async (_root, { id }, ctx) => {
        const viewer = await ctx.requireViewer()
        await setEdge(ctx.db, table, viewer.id, String(id), on)
        return freshPost(ctx, String(id))
      },
    }),
  )
}
