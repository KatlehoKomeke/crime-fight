import { useRouter } from 'expo-router'
import { NotificationRow } from '@/components/NotificationRow'
import { FeedList } from '@/components/PostList'
import { PageHeader, Screen } from '@/components/Screen'
import { Button, EmptyState } from '@/components/ui'
import { NotificationsQuery } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { useHydrate } from '@/lib/graphql/hydrate'
import { prefetch } from '@/lib/graphql/prefetch'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { pageMetadata } from '@/lib/seo'
import { useMarkNotificationsSeen } from '@/lib/unread-notifications'
import { notificationsVariables } from '@/lib/variables'

// Loaders run anonymously, so this prefetches the official alerts everyone sees.
export function loader() {
  return prefetch((fetch) => fetch(NotificationsQuery, notificationsVariables()))
}

export function generateMetadata() {
  return pageMetadata({ title: 'Notifications', path: '/notifications', noindex: true })
}

export default function NotificationsScreen() {
  useHydrate()
  const router = useRouter()
  const { status } = useAuth()
  const notifications = usePaginatedQuery(NotificationsQuery, notificationsVariables(), (data) => data?.notifications)
  useMarkNotificationsSeen(notifications.nodes[0]?.createdAt)
  const signedIn = status === 'signed-in'

  return (
    <Screen title="Notifications" header={<PageHeader title="Notifications" subtitle={signedIn ? 'Your activity and official alerts' : 'Official alerts'} />}>
      <FeedList
        {...notifications}
        renderItem={(notification) => <NotificationRow notification={notification} />}
        onEndReached={notifications.loadMore}
        onRefresh={notifications.refresh}
        empty={
          signedIn ? (
            <EmptyState icon="bell" title="Nothing yet" body="Replies, likes, reposts and new followers show up here, along with official alerts." />
          ) : (
            <EmptyState
              icon="bell"
              title="No active alerts"
              body="Nothing official right now. Sign in to also hear about replies, likes, reposts and new followers."
              action={status === 'signed-out' ? <Button label="Sign in" onPress={() => router.push('/sign-in')} /> : undefined}
            />
          )
        }
      />
    </Screen>
  )
}
