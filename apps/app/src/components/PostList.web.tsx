import { type ComponentRef, useEffect, useRef } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useColors } from '@/theme'
import { PostCard } from './PostCard'
import type { PostListProps } from './PostList.types'
import { Button, EmptyState, PostSkeleton } from './ui'

/**
 * Web: plain document flow (no nested scroll container) so the page scrolls
 * natively, sticky headers work, and every post is real HTML for crawlers.
 * An IntersectionObserver sentinel drives infinite scroll.
 */
export function PostList({ nodes, loading, loadingMore, hasMore, onEndReached, onRefresh, error, header, empty }: PostListProps) {
  const c = useColors()
  const sentinel = useRef<ComponentRef<typeof View>>(null)
  const latest = useRef(onEndReached)
  useEffect(() => {
    latest.current = onEndReached
  })

  // Re-observed whenever the list grows: if the sentinel is still on screen
  // after a page loads, the fresh observer fires again and fetches the next one.
  const count = nodes.length
  useEffect(() => {
    const node = sentinel.current as unknown as Element | null
    if (!node || !hasMore || count === 0) return
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && latest.current(), { rootMargin: '800px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, count])

  return (
    <View role="feed" aria-busy={loading || loadingMore}>
      {header}
      {nodes.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {loading && nodes.length === 0 ? [0, 1, 2, 3].map((i) => <PostSkeleton key={i} />) : null}
      {!loading && nodes.length === 0 && error ? (
        <EmptyState icon="globe" title="Can’t reach CIVIC/ONE" body="Check your connection and try again." action={onRefresh ? <Button label="Retry" tone="outline" onPress={onRefresh} /> : undefined} />
      ) : null}
      {!loading && nodes.length === 0 && !error ? empty : null}
      <View ref={sentinel} style={{ height: 1 }} />
      {loadingMore ? <ActivityIndicator style={{ padding: 24 }} color={c.textMuted} /> : null}
      {hasMore && !loadingMore && nodes.length > 0 ? (
        // Keyboard/no-JS-observer fallback.
        <View style={{ alignItems: 'center', padding: 16 }}>
          <Button label="Show more" tone="ghost" onPress={onEndReached} />
        </View>
      ) : null}
    </View>
  )
}
