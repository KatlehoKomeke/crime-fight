import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native'
import { useColors } from '@/theme'
import { PostCard } from './PostCard'
import type { PostListProps } from './PostList.types'
import { Button, EmptyState, PostSkeleton } from './ui'

/** Native: virtualised list with pull-to-refresh and infinite scroll. */
export function PostList({ nodes, loading, loadingMore, hasMore, onEndReached, onRefresh, refreshing, error, header, empty }: PostListProps) {
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
      keyExtractor={(post) => post.id}
      renderItem={({ item }) => <PostCard post={item} />}
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
