import type { ConversationRowFieldsFragment } from '@civic/graphql'
import { useRouter } from 'expo-router'
import { ActivityIndicator, FlatList, Platform, RefreshControl, View } from 'react-native'
import { ConversationRow } from '@/components/messages/ConversationRow'
import { PageHeader, Screen } from '@/components/Screen'
import { Button, EmptyState, IconButton, PostSkeleton } from '@/components/ui'
import { ConversationsQuery } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { useRealtimeReconnect } from '@/lib/graphql/provider'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { pageMetadata } from '@/lib/seo'
import { PAGE_SIZE } from '@/lib/variables'
import { useColors } from '@/theme'

export function generateMetadata() {
  return pageMetadata({ title: 'Messages', path: '/messages', noindex: true })
}

// Live events update a conversation's last message in place; sorting here moves it to the top without a refetch.
const byLatest = (a: ConversationRowFieldsFragment, b: ConversationRowFieldsFragment) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')

export default function MessagesScreen() {
  const c = useColors()
  const router = useRouter()
  const { status } = useAuth()
  const inbox = usePaginatedQuery(ConversationsQuery, { first: PAGE_SIZE }, (data) => data?.conversations, { pause: status !== 'signed-in' })
  useRealtimeReconnect(inbox.refresh)
  const conversations = [...inbox.nodes].sort(byLatest)
  const loading = inbox.loading || status === 'loading'

  const empty = loading ? (
    <View>
      {[0, 1, 2].map((i) => (
        <PostSkeleton key={i} />
      ))}
    </View>
  ) : inbox.error ? (
    <EmptyState icon="globe" title="Can’t reach CIVIC/ONE" body="Check your connection and try again." action={<Button label="Retry" tone="outline" onPress={inbox.refresh} />} />
  ) : (
    <EmptyState
      icon="mail"
      title="No messages yet"
      body="You can message people who follow you and whom you follow back. Conversations are private to the two of you."
      action={<Button label="New message" icon="plus" onPress={() => router.push('/messages/new')} />}
    />
  )

  return (
    <Screen
      title="Messages"
      header={
        <PageHeader
          title="Messages"
          subtitle="Private conversations with people who follow you back"
          right={status === 'signed-in' ? <IconButton icon="plus" label="New message" onPress={() => router.push('/messages/new')} /> : undefined}
        />
      }
    >
      {status === 'signed-out' ? (
        <EmptyState
          icon="lock"
          title="Your messages live here"
          body="Sign in to message neighbours, newsrooms and support services you follow, when they follow you back."
          action={<Button label="Sign in" onPress={() => router.push('/sign-in')} />}
        />
      ) : Platform.OS === 'web' ? (
        <View aria-busy={loading}>
          {conversations.length ? conversations.map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} />) : empty}
          {inbox.hasMore ? (
            <View style={{ alignItems: 'center', padding: 16 }}>
              {inbox.loadingMore ? <ActivityIndicator color={c.textMuted} /> : <Button label="Show more" tone="ghost" onPress={inbox.loadMore} />}
            </View>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(conversation) => conversation.id}
          renderItem={({ item }) => <ConversationRow conversation={item} />}
          ListEmptyComponent={empty}
          ListFooterComponent={inbox.loadingMore ? <ActivityIndicator style={{ padding: 24 }} color={c.textMuted} /> : undefined}
          onEndReached={inbox.hasMore ? inbox.loadMore : undefined}
          onEndReachedThreshold={0.6}
          refreshControl={<RefreshControl refreshing={inbox.refreshing} onRefresh={inbox.refresh} tintColor={c.textMuted} />}
          contentContainerStyle={{ paddingBottom: 96 }}
        />
      )}
    </Screen>
  )
}
