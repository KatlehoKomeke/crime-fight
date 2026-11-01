import { DEFAULT_CENTER } from '@civic/core'
import { useRouter } from 'expo-router'
import { ContextBar } from '@/components/ContextBar'
import { NotificationRow } from '@/components/NotificationRow'
import { FeedList } from '@/components/PostList'
import { PageHeader, Screen } from '@/components/Screen'
import { Button, EmptyState } from '@/components/ui'
import { NotificationsQuery } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { useHydrate } from '@/lib/graphql/hydrate'
import { prefetch } from '@/lib/graphql/prefetch'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { useNear } from '@/lib/location'
import { pageMetadata } from '@/lib/seo'
import { useMarkNotificationsSeen } from '@/lib/unread-notifications'
import { notificationsVariables } from '@/lib/variables'

// Loaders run anonymously, so this prefetches the official alerts everyone sees.
export function loader() {
  return prefetch((fetch) => fetch(NotificationsQuery, notificationsVariables(DEFAULT_CENTER)))
}

export function generateMetadata() {
  return pageMetadata({ title: 'Notifications', path: '/notifications', noindex: true })
}

export default function NotificationsScreen() {
  useHydrate()
  const router = useRouter()
  const { status } = useAuth()
  const near = useNear()
  const notifications = usePaginatedQuery(NotificationsQuery, notificationsVariables(near.point), (data) => data?.notifications)
  useMarkNotificationsSeen(notifications.nodes[0]?.createdAt)
  const signedIn = status === 'signed-in'

  return (
    <Screen title="Notifications" header={<PageHeader title="Notifications" subtitle={signedIn ? 'Your activity and official alerts near you' : 'Official alerts near you'} />}>
      <FeedList
        {...notifications}
        renderItem={(notification) => <NotificationRow notification={notification} />}
        onEndReached={notifications.loadMore}
        onRefresh={notifications.refresh}
        header={<ContextBar label="Alerts for" />}
        empty={
          signedIn ? (
            <EmptyState icon="bell" title="Nothing yet" body="Replies, likes, reposts and new followers show up here, along with official alerts within 15 km." />
          ) : (
            <EmptyState
              icon="bell"
              title="No active alerts"
              body="Nothing official within 15 km right now. Sign in to also hear about replies, likes, reposts and new followers."
              action={status === 'signed-out' ? <Button label="Sign in" onPress={() => router.push('/sign-in')} /> : undefined}
            />
          )
        }
      />
    </Screen>
  )
}
