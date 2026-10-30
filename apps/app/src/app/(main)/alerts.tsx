import { DEFAULT_CENTER } from '@civic/core'
import { ContextBar } from '@/components/ContextBar'
import { PostList } from '@/components/PostList'
import { PageHeader, Screen } from '@/components/Screen'
import { EmptyState } from '@/components/ui'
import { AlertsQuery } from '@/graphql/documents'
import { useHydrate } from '@/lib/graphql/hydrate'
import { prefetch } from '@/lib/graphql/prefetch'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { useNear } from '@/lib/location'
import { pageMetadata } from '@/lib/seo'
import { alertsVariables } from '@/lib/variables'

export function loader() {
  return prefetch((fetch) => fetch(AlertsQuery, alertsVariables(DEFAULT_CENTER)))
}

export function generateMetadata() {
  return pageMetadata({ title: 'Alerts', description: 'Official alerts and advisories from verified police, city and newsroom accounts near you.', path: '/alerts' })
}

export default function AlertsScreen() {
  useHydrate()
  const near = useNear()
  const alerts = usePaginatedQuery(AlertsQuery, alertsVariables(near.point), (data) => data?.alerts)
  return (
    <Screen title="Alerts" header={<PageHeader title="Alerts" subtitle="Verified official sources only" />}>
      <PostList
        {...alerts}
        onEndReached={alerts.loadMore}
        onRefresh={alerts.refresh}
        header={<ContextBar label="Alerts for" />}
        empty={<EmptyState icon="bell" title="No active alerts" body="Nothing official within 15 km right now. We’ll show road closures, advisories and warnings here as they’re issued." />}
      />
    </Screen>
  )
}
