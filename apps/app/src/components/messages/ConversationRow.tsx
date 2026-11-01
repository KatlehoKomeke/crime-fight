import { formatRelativeTime } from '@civic/core'
import type { ConversationRowFieldsFragment } from '@civic/graphql'
import { StyleSheet, View } from 'react-native'
import { brand, useColors } from '@/theme'
import { HoverLink } from '../HoverLink'
import { Avatar, Txt, VerifiedBadge } from '../ui'

export function ConversationRow({ conversation }: { conversation: ConversationRowFieldsFragment }) {
  const c = useColors()
  const other = conversation.members[0]
  const last = conversation.lastMessage
  const unread = conversation.unreadCount > 0
  if (!other) return null

  return (
    <HoverLink
      href={`/messages/${conversation.id}`}
      accessibilityLabel={`${other.displayName}${unread ? `, ${conversation.unreadCount} unread` : ''}: ${last?.body ?? ''}`}
      style={[styles.row, { borderBottomColor: c.line }]}
      hoverStyle={{ backgroundColor: c.surfaceAlt }}
    >
      <Avatar initials={other.initials} url={other.avatarUrl} size={48} official={other.verified && other.role !== 'MEMBER'} />
      <View style={styles.text}>
        <View style={styles.top}>
          <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {other.displayName}
          </Txt>
          {other.verified ? <VerifiedBadge size={14} /> : null}
          <Txt variant="small" color="textMuted" numberOfLines={1} style={{ flexShrink: 2 }}>
            @{other.handle}
          </Txt>
          {conversation.lastMessageAt ? (
            <Txt variant="small" color="textMuted">
              · {formatRelativeTime(conversation.lastMessageAt)}
            </Txt>
          ) : null}
        </View>
        {last ? (
          <Txt variant={unread ? 'smallStrong' : 'small'} color={unread ? 'text' : 'textMuted'} numberOfLines={1}>
            {last.isMine ? 'You: ' : ''}
            {last.body}
          </Txt>
        ) : null}
      </View>
      {unread ? <View style={[styles.dot, { backgroundColor: brand.coral }]} /> : null}
    </HoverLink>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
})
