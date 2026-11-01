import { formatRelativeTime } from '@civic/core'
import type { NotificationsQuery } from '@civic/graphql'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { useColors } from '@/theme'
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

/** Alerts and replies read as posts; likes, reposts and follows as a line of activity. */
export function NotificationRow({ notification }: { notification: NotificationNode }) {
  const { kind, post } = notification
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

  return (
    <Pressable
      onPress={() => router.push(post ? `/post/${post.id}` : `/u/${actor.handle}`)}
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: 1 },
  gutter: { width: 44, alignItems: 'flex-end' },
  main: { flex: 1, minWidth: 0, gap: 8 },
})
