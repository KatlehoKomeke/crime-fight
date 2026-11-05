import { formatRelativeTime } from '@civic/core'
import type { NotificationsQuery } from '@civic/graphql'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { bountyNotificationText } from '@/lib/bounty-copy'
import { profilePath } from '@/lib/profile'
import { brand, useColors } from '@/theme'
import { Icon, type IconName } from './Icon'
import { PostCard } from './PostCard'
import { Avatar, Txt } from './ui'

export type NotificationNode = NotificationsQuery['notifications']['edges'][number]['node']
type Post = NonNullable<NotificationNode['post']>

const ACTIVITY: Record<'LIKE' | 'REPOST' | 'FOLLOW', { icon: IconName; verb: string }> = {
  LIKE: { icon: 'heart', verb: 'liked your' },
  REPOST: { icon: 'repost', verb: 'reposted your' },
  FOLLOW: { icon: 'profile', verb: 'followed you' },
}

const noun = (post: Post) => (post.replyTo ? 'reply' : post.kind === 'UPDATE' ? 'update' : post.kind.toLowerCase())

/** Alerts and replies read as posts; likes, reposts, follows and bounty events as a line of activity. */
export function NotificationRow({ notification }: { notification: NotificationNode }) {
  const { kind, post } = notification
  if (kind === 'BOUNTY') return <BountyActivity notification={notification} />
  if (kind === 'FOLLOW') return <Activity notification={notification} kind={kind} />
  // The post was deleted after the list loaded.
  if (!post) return null
  if (kind === 'ALERT' || kind === 'REPLY') return <PostCard post={post} />
  return <Activity notification={notification} kind={kind} post={post} />
}

function Activity({ notification, kind, post }: { notification: NotificationNode; kind: keyof typeof ACTIVITY; post?: Post }) {
  const c = useColors()
  const router = useRouter()
  const { actor } = notification
  const { icon, verb } = ACTIVITY[kind]
  // Only bounty events come without someone behind them.
  if (!actor) return null

  return (
    <Pressable
      onPress={() => router.push(post ? `/post/${post.id}` : profilePath(actor.handle))}
      accessibilityRole="link"
      style={({ hovered }) => [styles.row, { borderBottomColor: c.line }, hovered && { backgroundColor: c.bg }]}
    >
      <View style={styles.gutter}>
        <Icon name={icon} size={24} color={kind === 'LIKE' ? c.danger : c.accentText} filled={kind !== 'REPOST'} />
      </View>
      <View style={styles.main}>
        <Avatar initials={actor.initials} url={actor.avatarUrl} size={32} official={actor.verified && actor.role !== 'MEMBER'} />
        <Txt>
          <Txt variant="bodyStrong">{actor.displayName}</Txt> {verb}
          {post ? ` ${noun(post)}` : null}
          <Txt color="textMuted"> · {formatRelativeTime(notification.createdAt)}</Txt>
        </Txt>
        {post ? (
          <Txt color="textMuted" numberOfLines={3}>
            {post.body}
          </Txt>
        ) : null}
      </View>
    </Pressable>
  )
}

/**
 * Something happened to a bounty you posted or claimed. Actions by CIVIC/ONE
 * itself (the sweep, an administrator) carry no actor and show the shield mark;
 * an administrator's handle is never exposed.
 */
function BountyActivity({ notification }: { notification: NotificationNode }) {
  const c = useColors()
  const router = useRouter()
  const { actor, bounty, bountyEvent, note } = notification
  // The bounty was hidden or removed after the list loaded.
  if (!bounty || !bountyEvent) return null

  return (
    <Pressable
      onPress={() => router.push(`/bounties/${bounty.id}`)}
      accessibilityRole="link"
      accessibilityLabel={bountyNotificationText(bountyEvent, bounty)}
      style={({ hovered }) => [styles.row, { borderBottomColor: c.line }, hovered && { backgroundColor: c.bg }]}
    >
      <View style={styles.gutter}>
        <Icon name="bounty" size={24} color={c.accentText} />
      </View>
      <View style={styles.main}>
        <View style={styles.who}>
          {actor ? (
            <Avatar initials={actor.initials} url={actor.avatarUrl} size={32} official={actor.verified && actor.role !== 'MEMBER'} />
          ) : (
            <View style={styles.mark} accessibilityLabel="CIVIC/ONE">
              <Icon name="shield" size={16} color={brand.lime} />
            </View>
          )}
          <Txt variant="small" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
            <Txt variant="smallStrong">{actor ? actor.displayName : 'CIVIC/ONE'}</Txt> · {formatRelativeTime(notification.createdAt)}
          </Txt>
        </View>
        <Txt>{bountyNotificationText(bountyEvent, bounty)}</Txt>
        {note ? (
          <Txt color="textMuted" numberOfLines={3}>
            “{note}”
          </Txt>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: 1 },
  gutter: { width: 44, alignItems: 'flex-end' },
  main: { flex: 1, minWidth: 0, gap: 8 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { width: 32, height: 32, borderRadius: 16, backgroundColor: brand.ink, alignItems: 'center', justifyContent: 'center' },
})
