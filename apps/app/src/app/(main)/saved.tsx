import { useRouter } from 'expo-router'
import { View } from 'react-native'
import { PostList } from '@/components/PostList'
import { PageHeader, Screen } from '@/components/Screen'
import { Button, EmptyState } from '@/components/ui'
import { SavedQuery } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { pageMetadata } from '@/lib/seo'
import { PAGE_SIZE } from '@/lib/variables'

export function generateMetadata() {
  return pageMetadata({ title: 'Saved', path: '/saved', noindex: true })
}

export default function SavedScreen() {
  const router = useRouter()
  const { status } = useAuth()
  const saved = usePaginatedQuery(SavedQuery, { first: PAGE_SIZE }, (data) => data?.savedPosts, { pause: status !== 'signed-in' })

  return (
    <Screen title="Saved" header={<PageHeader title="Saved" subtitle="Only you can see these" />}>
      {status === 'signed-in' ? (
        <PostList
          {...saved}
          onEndReached={saved.loadMore}
          onRefresh={saved.refresh}
          header={<View />}
          empty={<EmptyState icon="bookmark" title="Nothing saved yet" body="Tap the bookmark on any update to keep it here — handy for advisories you want to revisit." />}
        />
      ) : (
        <EmptyState icon="lock" title="Your saved updates live here" body="Sign in to bookmark advisories and updates and find them on any device." action={<Button label="Sign in" onPress={() => router.push('/sign-in')} />} />
      )}
    </Screen>
  )
}
