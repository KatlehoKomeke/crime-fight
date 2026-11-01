import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native'
import { useColors } from '@/theme'
import { PostCard } from './PostCard'
import type { FeedListProps, PostListProps } from './PostList.types'
import { Button, EmptyState, PostSkeleton } from './ui'

export function PostList(props: PostListProps) {
  return <FeedList {...props} renderItem={(post) => <PostCard post={post} />} />
}

/** Native: virtualised list with pull-to-refresh and infinite scroll. */
export function FeedList<Node extends { id: string }>({
  nodes,
  renderItem,
  loading,
  loadingMore,
  hasMore,
  onEndReached,
  onRefresh,
  refreshing,
  error,
  header,
  empty,
}: FeedListProps<Node>) {
  const c = useColors()
  const emptyState = () => {
    if (loading) {
      return (
        <View>
          {[0, 1, 2, 3].map((i) => (
            <PostSkeleton key={i} />
          ))}
        </View>
      )
    }
    if (error) {
      return <EmptyState icon="globe" title="Can’t reach CIVIC/ONE" body="Check your connection and try again." action={onRefresh ? <Button label="Retry" tone="outline" onPress={onRefresh} /> : undefined} />
    }
    return empty
  }
  return (
    <FlatList
      data={nodes}
      keyExtractor={(node) => node.id}
      renderItem={({ item }) => renderItem(item)}
      ListHeaderComponent={header ?? undefined}
      ListEmptyComponent={emptyState()}
      ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 24 }} color={c.textMuted} /> : undefined}
      onEndReached={hasMore ? onEndReached : undefined}
      onEndReachedThreshold={0.6}
      refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={c.textMuted} /> : undefined}
      contentContainerStyle={{ paddingBottom: 96 }}
      style={{ backgroundColor: c.surface }}
    />
  )
}
