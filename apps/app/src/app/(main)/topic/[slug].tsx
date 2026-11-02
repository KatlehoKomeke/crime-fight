import type { TopicMetadataQuery as TopicMetadata } from '@civic/graphql'
import { useLocalSearchParams } from 'expo-router'
import type { ImmutableRequest } from 'expo-router/server'
import { View } from 'react-native'
import { PostList } from '@/components/PostList'
import { PageHeader, Screen } from '@/components/Screen'
import { EmptyState } from '@/components/ui'
import { TopicMetadataQuery, TopicQuery } from '@/graphql/documents'
import { useHydrate } from '@/lib/graphql/hydrate'
import { prefetch } from '@/lib/graphql/prefetch'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { pageMetadata } from '@/lib/seo'
import { PAGE_SIZE, param } from '@/lib/variables'

const variables = (slug: string) => ({ slug: slug.toLowerCase(), first: PAGE_SIZE })

export function loader(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  return prefetch((fetch) => fetch(TopicQuery, variables(param(params.slug))))
}

export async function generateMetadata(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  const slug = param(params.slug)
  let topic: TopicMetadata['topic'] | undefined
  await prefetch(async (fetch) => {
    // The loader runs next and asks for TopicQuery; starting it now means it doesn't wait.
    const [metadata] = await Promise.all([fetch(TopicMetadataQuery, { slug: slug.toLowerCase() }), fetch(TopicQuery, variables(slug))])
    topic = metadata?.topic
  })
  return pageMetadata({
    title: topic ? `#${topic.title}` : `#${slug}`,
    description: topic ? `Verified local updates and community posts about ${topic.title}, in ${topic.category.toLowerCase()}.` : undefined,
    path: `/topic/${topic?.slug ?? slug}`,
    image: topic?.previewImage,
    noindex: !topic,
  })
}

export default function TopicScreen() {
  useHydrate()
  const slug = param(useLocalSearchParams<{ slug: string }>().slug)
  const topic = usePaginatedQuery(TopicQuery, variables(slug), (data) => data?.topic?.posts)
  const info = topic.data?.topic

  return (
    <Screen title={info ? `#${info.title}` : `#${slug}`} header={<PageHeader title={info ? `#${info.title}` : `#${slug}`} subtitle={info?.category} back />}>
      {!info && !topic.loading ? (
        <EmptyState icon="search" title={`No posts about #${slug}`} body="Be the first to add a verified, privacy-safe update." />
      ) : (
        <PostList {...topic} onEndReached={topic.loadMore} onRefresh={topic.refresh} header={<View />} empty={<EmptyState icon="comment" title="No posts yet" body="Updates tagged with this topic will appear here." />} />
      )}
    </Screen>
  )
}
