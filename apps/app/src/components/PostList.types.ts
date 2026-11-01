import type { PostCardFieldsFragment } from '@civic/graphql'
import type { ReactElement } from 'react'
import type { CombinedError } from 'urql'

export interface FeedListProps<Node extends { id: string }> {
  nodes: Node[]
  renderItem: (node: Node) => ReactElement | null
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  onEndReached: () => void
  onRefresh?: () => void
  refreshing?: boolean
  error?: CombinedError
  header?: ReactElement | null
  empty?: ReactElement
}

export type PostListProps = Omit<FeedListProps<PostCardFieldsFragment>, 'renderItem'>
