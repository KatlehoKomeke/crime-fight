import { useRouter } from 'expo-router'
import { PageHeader, Screen } from '@/components/Screen'
import { Button, EmptyState } from '@/components/ui'

export default function NotFound() {
  const router = useRouter()
  return (
    <Screen title="Not found" header={<PageHeader title="Not found" back />}>
      <EmptyState icon="search" title="This page doesn’t exist" body="The link may be broken, or the page may have been removed." action={<Button label="Go to your feed" onPress={() => router.replace('/')} />} />
    </Screen>
  )
}
