import { useMemo } from 'react'
import { Platform, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { useQuery, useSubscription } from 'urql'
import { InboxStateQuery, InboxSubscription } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { getConfig } from '@/lib/config'
import { useRealtimeReconnect } from '@/lib/graphql/provider'
import { brand, fonts, useColors } from '@/theme'
import { HoverLink } from '../HoverLink'
import { Icon } from '../Icon'
import { useShellMode } from '../shell/use-shell-mode'

/** Your realtime channel and how many conversations have unread messages. */
export function useInboxState() {
  const { status } = useAuth()
  const [{ data }, refetch] = useQuery({ query: InboxStateQuery, pause: status !== 'signed-in' })
  const viewer = status === 'signed-in' ? data?.viewer : null
  return { channel: viewer?.inboxChannel ?? null, unread: viewer?.unreadConversationCount ?? 0, refetch }
}

/**
 * Keeps messaging live while you're signed in: subscribes to your inbox
 * channel, and every event lands in the normalised cache (lib/graphql/cache.ts),
 * so badges, the inbox and open threads update wherever they are on screen.
 */
export function InboxListener() {
  const { channel, refetch } = useInboxState()
  const context = useMemo(() => ({ channel }), [channel])
  useSubscription({ query: InboxSubscription, pause: !channel || !getConfig().realtime, context })
  useRealtimeReconnect(() => refetch({ requestPolicy: 'network-only' }))
  return null
}

/** Phones reach Messages from the home header (the tab bar is full); wider screens use the side rail. */
export function MessagesButton() {
  const c = useColors()
  const shell = useShellMode()
  const { status } = useAuth()
  const { unread } = useInboxState()
  if (status !== 'signed-in' || (shell !== 'phone' && shell !== 'css')) return null
  return (
    <View dataSet={{ mobileOnly: true }} style={[styles.headerButton, Platform.OS === 'web' && { display: 'none' }]}>
      <HoverLink
        href="/messages"
        accessibilityLabel={unread ? `Messages, ${unread} unread` : 'Messages'}
        style={styles.headerLink}
        hoverStyle={{ backgroundColor: c.surfaceAlt }}
      >
        <View>
          <Icon name="mail" size={22} color={c.text} />
          <UnreadBadge count={unread} />
        </View>
      </HoverLink>
    </View>
  )
}

/** Unread count over an icon. */
export function UnreadBadge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  const c = useColors()
  if (count <= 0) return null
  return (
    <View accessibilityLabel={`${count} unread`} style={[styles.badge, { backgroundColor: brand.coral, borderColor: c.bg }, style]}>
      <Text style={styles.count}>{count > 9 ? '9+' : count}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -6,
    right: -9,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { color: '#ffffff', fontFamily: fonts.bold, fontSize: 10, lineHeight: 12 },
  headerButton: { justifyContent: 'center', paddingRight: 8 },
  headerLink: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
})
