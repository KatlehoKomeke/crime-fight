import type { ConversationRowFieldsFragment } from '@civic/graphql'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useMutation } from 'urql'
import { endsRun, MessageBubble, type ThreadItem } from '@/components/messages/MessageBubble'
import { MessageComposer } from '@/components/messages/MessageComposer'
import { PageHeader, Screen } from '@/components/Screen'
import { useToast } from '@/components/Toast'
import { Avatar, Button, EmptyState, Skeleton, Txt } from '@/components/ui'
import { ConversationQuery, MarkConversationRead, SendMessage } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { useRealtimeReconnect } from '@/lib/graphql/provider'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { profilePath } from '@/lib/profile'
import { pageMetadata } from '@/lib/seo'
import { useAppVisible } from '@/lib/use-app-visible'
import { param } from '@/lib/variables'
import { useColors } from '@/theme'

const MESSAGES_PAGE = 30

export function generateMetadata() {
  return pageMetadata({ title: 'Messages', path: '/messages', noindex: true })
}

interface Pending {
  key: string
  conversationId: string
  body: string
  createdAt: string
  failed: boolean
}

interface ThreadProps {
  items: ThreadItem[]
  intro: ReactNode
  loading: boolean
  hasMore: boolean
  loadingMore: boolean
  onLoadEarlier: () => void
  onRetry: (item: ThreadItem) => void
}

export default function ConversationScreen() {
  const router = useRouter()
  const toast = useToast()
  const { status } = useAuth()
  const id = param(useLocalSearchParams<{ id: string }>().id)
  const thread = usePaginatedQuery(ConversationQuery, { id, first: MESSAGES_PAGE }, (data) => data?.conversation?.messages, { pause: status !== 'signed-in' })
  useRealtimeReconnect(thread.refresh)
  const conversation = thread.data?.conversation
  const other = conversation?.members[0]
  const [, sendMessage] = useMutation(SendMessage)
  const [, markRead] = useMutation(MarkConversationRead)
  const [pending, setPending] = useState<Pending[]>([])
  const visible = useAppVisible()

  // Looking at the thread reads it, which clears the unread count and badge on
  // every device. Once per newest message, so a message arriving mid-request is read too.
  const unread = conversation?.unreadCount ?? 0
  const lastMessageAt = conversation?.lastMessageAt
  const markedUpTo = useRef<string | null>(null)
  useEffect(() => {
    if (!unread || !visible || !lastMessageAt || markedUpTo.current === `${id}@${lastMessageAt}`) return
    markedUpTo.current = `${id}@${lastMessageAt}`
    void markRead({ id }).then((result) => {
      if (result.error) markedUpTo.current = null
    })
  }, [id, lastMessageAt, markRead, unread, visible])

  const send = async (body: string, key = `pending-${Date.now()}`) => {
    setPending((list) => [...list.filter((p) => p.key !== key), { key, conversationId: id, body, createdAt: new Date().toISOString(), failed: false }])
    const result = await sendMessage({ conversationId: id, body })
    if (result.error) {
      setPending((list) => list.map((p) => (p.key === key ? { ...p, failed: true } : p)))
      toast(result.error.graphQLErrors[0]?.message ?? 'Your message wasn’t sent')
    } else {
      setPending((list) => list.filter((p) => p.key !== key))
    }
  }

  if (status === 'signed-out') {
    return (
      <Screen title="Messages" header={<PageHeader title="Messages" back />}>
        <EmptyState icon="lock" title="Sign in to read your messages" body="Messages are private to the people in them." action={<Button label="Sign in" onPress={() => router.push('/sign-in')} />} />
      </Screen>
    )
  }

  if (status === 'signed-in' && !thread.loading && !conversation) {
    return (
      <Screen title="Messages" header={<PageHeader title="Messages" back />}>
        {thread.error ? (
          <EmptyState icon="globe" title="Can’t reach CIVIC/ONE" body="Check your connection and try again." action={<Button label="Retry" tone="outline" onPress={thread.refresh} />} />
        ) : (
          <EmptyState
            icon="mail"
            title="This conversation isn’t available"
            body="It may not exist, or you’re not part of it."
            action={<Button label="All messages" tone="outline" onPress={() => router.replace('/messages')} />}
          />
        )}
      </Screen>
    )
  }

  const items: ThreadItem[] = [
    ...thread.nodes.toReversed().map((message) => ({ key: message.id, body: message.body, createdAt: message.createdAt, mine: message.isMine })),
    ...pending
      .filter((p) => p.conversationId === id)
      .map((p): ThreadItem => ({ key: p.key, body: p.body, createdAt: p.createdAt, mine: true, status: p.failed ? 'failed' : 'sending' })),
  ]
  const props: ThreadProps = {
    items,
    intro: other ? <Intro other={other} /> : null,
    loading: thread.loading || status === 'loading',
    hasMore: thread.hasMore,
    loadingMore: thread.loadingMore,
    onLoadEarlier: thread.loadMore,
    onRetry: (item) => void send(item.body, item.key),
  }
  const footer = conversation ? (
    conversation.viewerCanSend ? (
      <MessageComposer recipient={other?.displayName ?? ''} onSend={(body) => void send(body)} />
    ) : (
      <ClosedNotice handle={other?.handle ?? ''} />
    )
  ) : null

  return (
    <Screen
      title={other ? `${other.displayName} · Messages` : 'Messages'}
      header={
        <PageHeader
          title={other?.displayName ?? 'Messages'}
          subtitle={other ? `@${other.handle}` : undefined}
          back
          right={
            other ? (
              <Link href={profilePath(other.handle)} asChild>
                <Pressable accessibilityLabel={`${other.displayName} profile`}>
                  <Avatar initials={other.initials} url={other.avatarUrl} size={32} official={other.verified && other.role !== 'MEMBER'} />
                </Pressable>
              </Link>
            ) : undefined
          }
        />
      }
    >
      {Platform.OS === 'web' ? (
        <>
          <WebThread {...props} />
          {footer}
        </>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <NativeThread {...props} />
          {footer}
        </KeyboardAvoidingView>
      )}
    </Screen>
  )
}

/**
 * Web scrolls the document: oldest at the top, newest just above the sticky
 * composer. New messages keep you at the bottom unless you've scrolled up to
 * read history, and loading earlier messages holds your place.
 */
function WebThread({ items, intro, loading, hasMore, loadingMore, onLoadEarlier, onRetry }: ThreadProps) {
  const c = useColors()
  const atBottom = useRef(true)
  const anchor = useRef<number | null>(null)
  const newest = items.at(-1)

  useEffect(() => {
    const onScroll = () => {
      atBottom.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    if (newest && (atBottom.current || newest.mine)) window.scrollTo(0, document.documentElement.scrollHeight)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newest?.key])

  useLayoutEffect(() => {
    if (anchor.current === null || loadingMore) return
    window.scrollTo(0, document.documentElement.scrollHeight - anchor.current)
    anchor.current = null
  }, [items.length, loadingMore])

  const loadEarlier = () => {
    anchor.current = document.documentElement.scrollHeight - window.scrollY
    onLoadEarlier()
  }

  return (
    <View style={[styles.thread, styles.webThread]} role="log" aria-live="polite" aria-busy={loading}>
      {hasMore ? (
        <View style={styles.earlier}>
          {loadingMore ? <ActivityIndicator color={c.textMuted} /> : <Button label="Load earlier messages" tone="ghost" size="sm" onPress={loadEarlier} />}
        </View>
      ) : loading ? null : (
        intro
      )}
      {loading ? <ThreadSkeleton /> : null}
      {items.map((item, index) => (
        <MessageBubble key={item.key} item={item} showTime={endsRun(item, items[index + 1])} onRetry={() => onRetry(item)} />
      ))}
    </View>
  )
}

/** Native: an inverted list, so the newest message sits at the bottom and older pages load as you scroll up. */
function NativeThread({ items, intro, loading, hasMore, loadingMore, onLoadEarlier, onRetry }: ThreadProps) {
  const c = useColors()
  const newestFirst = items.toReversed()
  return (
    <FlatList
      inverted
      data={newestFirst}
      keyExtractor={(item) => item.key}
      renderItem={({ item, index }) => <MessageBubble item={item} showTime={endsRun(item, newestFirst[index - 1])} onRetry={() => onRetry(item)} />}
      onEndReached={hasMore ? onLoadEarlier : undefined}
      onEndReachedThreshold={0.4}
      // An inverted list's footer is at the top: the start of the conversation.
      ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 16 }} color={c.textMuted} /> : hasMore || loading ? undefined : <>{intro}</>}
      ListEmptyComponent={loading ? <ActivityIndicator style={{ padding: 24 }} color={c.textMuted} /> : undefined}
      contentContainerStyle={styles.thread}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    />
  )
}

function Intro({ other }: { other: ConversationRowFieldsFragment['members'][number] }) {
  return (
    <View style={styles.intro}>
      <Avatar initials={other.initials} url={other.avatarUrl} size={56} official={other.verified && other.role !== 'MEMBER'} />
      <Txt variant="title">{other.displayName}</Txt>
      <Txt variant="small" color="textMuted" style={{ textAlign: 'center', maxWidth: 320 }}>
        This is the start of your conversation with @{other.handle}. Only the two of you can see it.
      </Txt>
    </View>
  )
}

/** Shown instead of the composer once either person unfollows; the history stays readable. */
function ClosedNotice({ handle }: { handle: string }) {
  const c = useColors()
  return (
    <View style={[styles.closed, { borderTopColor: c.line, backgroundColor: c.surface }]}>
      <Txt variant="small" color="textMuted" style={{ textAlign: 'center' }}>
        You can’t reply because you and @{handle} no longer follow each other. Messages are open only between people who do.
      </Txt>
    </View>
  )
}

function ThreadSkeleton() {
  return (
    <View style={{ gap: 10 }} accessibilityElementsHidden>
      <Skeleton width="55%" height={36} style={{ borderRadius: 16 }} />
      <Skeleton width="40%" height={36} style={{ borderRadius: 16, alignSelf: 'flex-end' }} />
      <Skeleton width="62%" height={52} style={{ borderRadius: 16 }} />
    </View>
  )
}

const styles = StyleSheet.create({
  thread: { paddingHorizontal: 14, paddingVertical: 12 },
  // Fills the viewport between header and composer, with messages settling at the bottom.
  webThread: { flexGrow: 1, justifyContent: 'flex-end', ...(Platform.OS === 'web' ? ({ minHeight: 'calc(100dvh - 128px)' } as object) : null) },
  earlier: { alignItems: 'center', paddingBottom: 8 },
  intro: { alignItems: 'center', gap: 6, paddingVertical: 24 },
  closed: { paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1 },
})
