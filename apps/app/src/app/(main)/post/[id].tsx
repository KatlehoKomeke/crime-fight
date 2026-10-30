import { formatRelativeTimeLong } from '@civic/core'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { ImmutableRequest } from 'expo-router/server'
import { View } from 'react-native'
import { Composer } from '@/components/Composer'
import { JsonLd } from '@/components/JsonLd'
import { PostCard } from '@/components/PostCard'
import { PostList } from '@/components/PostList'
import { PageHeader, Screen } from '@/components/Screen'
import { Button, EmptyState, PostSkeleton, Txt } from '@/components/ui'
import { PostQuery } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { serverConfig } from '@/lib/config'
import { useHydrate } from '@/lib/graphql/hydrate'
import { prefetch } from '@/lib/graphql/prefetch'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { excerpt, pageMetadata } from '@/lib/seo'
import { PAGE_SIZE, param } from '@/lib/variables'
import { useColors } from '@/theme'

const variables = (id: string) => ({ id, first: PAGE_SIZE })

export function loader(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  return prefetch((fetch) => fetch(PostQuery, variables(param(params.id))))
}

export async function generateMetadata(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  const id = param(params.id)
  let post: { body: string; createdAt: string; author: { displayName: string; handle: string }; media: Array<{ url: string }> } | null | undefined
  await prefetch(async (fetch) => {
    post = (await fetch(PostQuery, variables(id)))?.post
  })
  if (!post) return pageMetadata({ title: 'Post not found', path: `/post/${id}`, noindex: true })
  return pageMetadata({
    title: `${post.author.displayName}: “${excerpt(post.body, 60)}”`,
    description: excerpt(post.body),
    path: `/post/${id}`,
    type: 'article',
    image: post.media[0]?.url,
    publishedTime: post.createdAt,
    extra: { authors: { name: post.author.displayName, url: `${serverConfig().siteUrl}/u/${post.author.handle}` } },
  })
}

export default function PostScreen() {
  useHydrate()
  const c = useColors()
  const router = useRouter()
  const { status } = useAuth()
  const id = param(useLocalSearchParams<{ id: string }>().id)
  const replies = usePaginatedQuery(PostQuery, variables(id), (result) => result?.post?.replies)
  const post = replies.data?.post
  const fetching = replies.loading

  return (
    <Screen title={post ? `${post.author.displayName}: “${excerpt(post.body, 60)}”` : 'Post'} header={<PageHeader title="Post" back />}>
      {post ? (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'SocialMediaPosting',
            headline: excerpt(post.body, 110),
            articleBody: post.body,
            datePublished: post.createdAt,
            author: { '@type': post.author.verified ? 'Organization' : 'Person', name: post.author.displayName, alternateName: `@${post.author.handle}` },
            interactionStatistic: [
              { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: post.likeCount },
              { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: post.replyCount },
            ],
          }}
        />
      ) : null}

      {!post && fetching ? <PostSkeleton /> : null}
      {!post && !fetching ? (
        <EmptyState icon="search" title="This post isn’t available" body="It may have been deleted by its author." action={<Button label="Back to feed" tone="outline" onPress={() => router.replace('/')} />} />
      ) : null}

      {post ? (
        <PostList
          nodes={replies.nodes}
          loading={false}
          loadingMore={replies.loadingMore}
          hasMore={replies.hasMore}
          onEndReached={replies.loadMore}
          onRefresh={replies.refresh}
          header={
            <View>
              <PostCard post={post} variant="detail" />
              <View style={{ paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line }}>
                <Txt variant="small" color="textMuted">
                  Posted {formatRelativeTimeLong(post.createdAt)}
                  {post.area ? ` · ${post.area}` : ''}
                </Txt>
              </View>
              {status === 'signed-in' ? (
                <View style={{ borderBottomWidth: 1, borderBottomColor: c.line }}>
                  <Composer compact replyTo={{ id: post.id, handle: post.author.handle }} />
                </View>
              ) : (
                <View style={{ padding: 18, borderBottomWidth: 1, borderBottomColor: c.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <Txt variant="small" color="textMuted" style={{ flex: 1 }}>
                    Sign in to add context or ask a question.
                  </Txt>
                  <Button label="Sign in to reply" size="sm" onPress={() => router.push('/sign-in')} />
                </View>
              )}
            </View>
          }
          empty={
            <Txt variant="small" color="textMuted" style={{ padding: 18 }}>
              No replies yet.
            </Txt>
          }
        />
      ) : null}
    </Screen>
  )
}
