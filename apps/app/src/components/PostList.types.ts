import type { PostCardFieldsFragment } from '@civic/graphql'
import type { ReactElement } from 'react'
import type { CombinedError } from 'urql'

export interface PostListProps {
  nodes: PostCardFieldsFragment[]
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
