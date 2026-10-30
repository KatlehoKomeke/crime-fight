import { formatCount, formatRelativeTime, formatRelativeTimeLong, type TrustBadge } from '@civic/core'
import type { PostCardFieldsFragment } from '@civic/graphql'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import { Link, useRouter } from 'expo-router'
import { memo, useState } from 'react'
import { Modal, Platform, Pressable, Share, StyleSheet, View } from 'react-native'
import { useMutation } from 'urql'
import { DeletePost, LikePost, RepostPost, SavePost, UnlikePost, UnrepostPost, UnsavePost } from '@/graphql/documents'
import { getConfig } from '@/lib/config'
import { useRequireAuth } from '@/lib/use-require-auth'
import { fonts, radius, useColors } from '@/theme'
import { useCompose } from './ComposeProvider'
import { Icon, type IconName } from './Icon'
import { RichText } from './RichText'
import { useToast } from './Toast'
import { Avatar, Touchable, TrustChip, Txt, VerifiedBadge } from './ui'

type Post = PostCardFieldsFragment

const OFFICIAL_ROLES = new Set(['OFFICIAL', 'NEWSROOM', 'SUPPORT'])

export const PostCard = memo(function PostCard({ post, variant = 'feed' }: { post: Post; variant?: 'feed' | 'detail' }) {
  const c = useColors()
  const router = useRouter()
  const href = `/post/${post.id}` as const
  const detail = variant === 'detail'
  const official = OFFICIAL_ROLES.has(post.author.role) && post.author.verified

  return (
    // The whole card opens the post; the timestamp is the crawlable/accessible link.
    <Pressable
      onPress={detail ? undefined : () => router.push(href)}
      style={({ hovered }) => [styles.post, { borderBottomColor: c.line }, hovered && !detail && { backgroundColor: c.bg }]}
    >
      <Link href={`/u/${post.author.handle}`} asChild>
        <Pressable accessibilityLabel={`${post.author.displayName} profile`}>
          <Avatar initials={post.author.initials} url={post.author.avatarUrl} official={official} />
        </Pressable>
      </Link>

      <View style={styles.main}>
        <View style={styles.head}>
          <View style={styles.byline}>
            <Link href={`/u/${post.author.handle}`} style={[styles.name, { color: c.text }]} numberOfLines={1}>
              {post.author.displayName}
            </Link>
            {post.author.verified ? <VerifiedBadge size={15} /> : null}
            <Txt variant="small" color="textMuted" numberOfLines={1} style={styles.handle}>
              @{post.author.handle} ·{' '}
            </Txt>
            <Link href={href} accessibilityLabel={formatRelativeTimeLong(post.createdAt)}>
              <Txt variant="small" color="textMuted">
                {formatRelativeTime(post.createdAt)}
              </Txt>
            </Link>
          </View>
          <PostMenu post={post} />
        </View>

        {post.replyTo ? (
          <Txt variant="small" color="textMuted" style={{ marginTop: 2 }}>
            Replying to{' '}
            <Link href={`/u/${post.replyTo.author.handle}`} style={{ color: c.accentText }}>
              @{post.replyTo.author.handle}
            </Link>
          </Txt>
        ) : null}

        {post.trustBadge ? (
          <View style={styles.badge}>
            <TrustChip badge={post.trustBadge as TrustBadge} />
          </View>
        ) : null}

        <RichText body={post.body} style={detail ? styles.detailBody : styles.body} />

        {post.kind !== 'UPDATE' ? <AlertCard post={post} onOpen={detail ? undefined : () => router.push(href)} /> : null}
        {post.media.map((media) => (
          <PostImage key={media.id} url={media.url} alt={media.alt} caption={media.caption ?? post.area} />
        ))}

        <PostActions post={post} />
      </View>
    </Pressable>
  )
})

function severityColor(severity: Post['severity'], c: ReturnType<typeof useColors>): string {
  switch (severity) {
    case 'CRITICAL':
    case 'WARNING':
      return c.danger
    case 'ADVISORY':
      return c.warning
    default:
      return c.accentText
  }
}

function AlertCard({ post, onOpen }: { post: Post; onOpen?: () => void }) {
  const c = useColors()
  const tone = severityColor(post.severity, c)
  const heading = [post.area, post.category].filter(Boolean).join(' · ') || (post.kind === 'ALERT' ? 'Public alert' : 'Advisory')
  return (
    <View style={[styles.alert, { borderColor: c.line, borderLeftColor: tone, backgroundColor: c.bg }]} accessibilityRole="summary">
      <View style={styles.alertText}>
        <View dataSet={{ pulse: true }} style={[styles.pulse, { backgroundColor: tone }]} />
        <View style={{ flexShrink: 1 }}>
          <Txt variant="micro">{heading}</Txt>
          <Txt variant="micro" color="textMuted" style={{ letterSpacing: 0.6 }}>
            {post.kind === 'ALERT' ? 'Alert' : 'Advisory'} · {post.severity?.toLowerCase() ?? 'info'}
          </Txt>
        </View>
      </View>
      {onOpen ? (
        <Touchable onPress={onOpen} style={[styles.alertButton, { borderColor: c.text }]} hoverStyle={{ backgroundColor: c.surfaceAlt }} accessibilityRole="button">
          <Txt variant="micro">View details</Txt>
        </Touchable>
      ) : null}
    </View>
  )
}

function PostImage({ url, alt, caption }: { url: string; alt: string; caption?: string | null }) {
  const c = useColors()
  return (
    <View style={[styles.image, { borderColor: c.line, backgroundColor: c.surfaceAlt }]}>
      <Image source={url} alt={alt} accessibilityLabel={alt} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      {caption ? (
        <View style={styles.caption}>
          <Txt variant="micro" style={{ color: '#fff' }}>
            {caption}
          </Txt>
        </View>
      ) : null}
    </View>
  )
}

function PostActions({ post }: { post: Post }) {
  const c = useColors()
  const toast = useToast()
  const gate = useRequireAuth()
  const { openCompose } = useCompose()
  const [, like] = useMutation(LikePost)
  const [, unlike] = useMutation(UnlikePost)
  const [, repost] = useMutation(RepostPost)
  const [, unrepost] = useMutation(UnrepostPost)
  const [, save] = useMutation(SavePost)
  const [, unsave] = useMutation(UnsavePost)

  const tap = () => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync()
  }

  const share = async () => {
    const url = `${getConfig().siteUrl}/post/${post.id}`
    if (Platform.OS !== 'web') {
      await Share.share({ message: `${post.body}\n\n${url}`, url })
    } else if (typeof navigator.share === 'function') {
      await navigator.share({ title: `${post.author.displayName} on CIVIC/ONE`, text: post.body, url }).catch(() => undefined)
    } else {
      await navigator.clipboard?.writeText(url)
      toast('Link copied')
    }
  }

  return (
    <View style={styles.actions}>
      <Action icon="comment" count={post.replyCount} label="Reply" onPress={gate(() => openCompose({ replyTo: { id: post.id, handle: post.author.handle } }), 'Sign in to reply')} />
      <Action
        icon="repost"
        count={post.repostCount}
        label={post.viewerHasReposted ? 'Undo repost' : 'Repost'}
        active={post.viewerHasReposted}
        activeColor={c.accentText}
        onPress={gate(() => {
          tap()
          void (post.viewerHasReposted ? unrepost({ id: post.id }) : repost({ id: post.id }).then(() => toast('Shared to your network')))
        }, 'Sign in to repost')}
      />
      <Action
        icon="heart"
        count={post.likeCount}
        label={post.viewerHasLiked ? 'Unlike' : 'Like'}
        active={post.viewerHasLiked}
        activeColor={c.danger}
        filled={post.viewerHasLiked}
        onPress={gate(() => {
          tap()
          void (post.viewerHasLiked ? unlike({ id: post.id }) : like({ id: post.id }))
        }, 'Sign in to like posts')}
      />
      <Action
        icon="bookmark"
        label={post.viewerHasSaved ? 'Remove from saved' : 'Save'}
        active={post.viewerHasSaved}
        activeColor={c.accentText}
        filled={post.viewerHasSaved}
        onPress={gate(() => {
          tap()
          void (post.viewerHasSaved ? unsave({ id: post.id }) : save({ id: post.id })).then(() => toast(post.viewerHasSaved ? 'Removed from saved' : 'Saved for later'))
        }, 'Sign in to save posts')}
      />
      <Action icon="share" label="Share" onPress={() => void share()} />
    </View>
  )
}

function Action({
  icon,
  count,
  label,
  active,
  activeColor,
  filled,
  onPress,
}: {
  icon: IconName
  count?: number
  label: string
  active?: boolean
  activeColor?: string
  filled?: boolean
  onPress: () => void
}) {
  const c = useColors()
  const color = active && activeColor ? activeColor : c.textMuted
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      accessibilityState={{ selected: active }}
      hitSlop={4}
      style={styles.action}
      hoverStyle={{ backgroundColor: c.surfaceAlt }}
    >
      <Icon name={icon} size={18} color={color} filled={filled} />
      {count !== undefined ? <Txt style={[styles.count, { color }]}>{formatCount(count)}</Txt> : null}
    </Touchable>
  )
}

function PostMenu({ post }: { post: Post }) {
  const c = useColors()
  const toast = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [, remove] = useMutation(DeletePost)

  const items: Array<{ icon: IconName; label: string; danger?: boolean; run: () => void }> = [
    {
      icon: 'share',
      label: 'Copy link',
      run: () => {
        const url = `${getConfig().siteUrl}/post/${post.id}`
        if (Platform.OS === 'web') void navigator.clipboard?.writeText(url)
        else void Share.share({ message: url, url })
        toast('Link copied')
      },
    },
    { icon: 'shield', label: 'Report to Trust & Safety', run: () => toast('Thanks — a moderator will review this post') },
  ]
  if (post.viewerCanDelete) {
    items.unshift({
      icon: 'trash',
      label: 'Delete post',
      danger: true,
      run: () =>
        void remove({ id: post.id }).then((result) => {
          if (result.error) return toast('Could not delete that post')
          toast('Post deleted')
          if (router.canGoBack()) router.back()
        }),
    })
  }

  return (
    <>
      <Touchable onPress={() => setOpen(true)} accessibilityLabel="More options" accessibilityRole="button" style={styles.menuButton} hoverStyle={{ backgroundColor: c.surfaceAlt }}>
        <Icon name="dots" size={18} color={c.textMuted} />
      </Touchable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.menuBackdrop, { backgroundColor: c.overlay }]} onPress={() => setOpen(false)} accessibilityLabel="Close menu">
          <View style={[styles.menu, { backgroundColor: c.surface, borderColor: c.line }]}>
            {items.map((item) => (
              <Touchable
                key={item.label}
                onPress={() => {
                  setOpen(false)
                  item.run()
                }}
                accessibilityRole="menuitem"
                style={styles.menuItem}
                hoverStyle={{ backgroundColor: c.surfaceAlt }}
              >
                <Icon name={item.icon} size={18} color={item.danger ? c.danger : c.text} />
                <Txt variant="bodyStrong" style={{ color: item.danger ? c.danger : c.text }}>
                  {item.label}
                </Txt>
              </Touchable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  post: { flexDirection: 'row', gap: 12, paddingTop: 16, paddingBottom: 8, paddingHorizontal: 18, borderBottomWidth: 1 },
  main: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 22 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, minWidth: 0 },
  name: { fontFamily: fonts.bold, fontSize: 14.5, flexShrink: 1 },
  handle: { flexShrink: 1 },
  badge: { marginTop: 6, marginBottom: 2 },
  body: { marginTop: 4 },
  detailBody: { marginTop: 8, fontSize: 18, lineHeight: 27 },
  alert: { marginTop: 12, minHeight: 56, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderLeftWidth: 3 },
  alertText: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  pulse: { width: 8, height: 8, borderRadius: 4 },
  alertButton: { paddingVertical: 7, paddingHorizontal: 10, borderWidth: 1 },
  image: { marginTop: 12, height: 260, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1 },
  caption: { position: 'absolute', left: 10, bottom: 10, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: 'rgba(16,17,15,0.82)' },
  actions: { marginTop: 8, maxWidth: 460, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: -8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 8, borderRadius: radius.pill },
  count: { fontFamily: fonts.medium, fontSize: 12.5 },
  menuButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  menuBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  menu: { width: '100%', maxWidth: 340, borderRadius: radius.lg, borderWidth: 1, paddingVertical: 6, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 18 },
})
