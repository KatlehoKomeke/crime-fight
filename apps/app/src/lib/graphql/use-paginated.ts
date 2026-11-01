import { useState } from 'react'
import { type AnyVariables, createRequest, type TypedDocumentNode, useQuery } from 'urql'

interface ConnectionLike<Node> {
  edges: ReadonlyArray<{ node: Node }>
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

/**
 * Infinite list over a Relay connection. The first page uses the exact
 * variables the route loader prefetched (so SSR data is reused); later pages
 * are fetched separately and merged into it by graphcache's relayPagination.
 */
export function usePaginatedQuery<Data, Variables extends AnyVariables, Node>(
  query: TypedDocumentNode<Data, Variables>,
  variables: Variables,
  select: (data: Data | undefined) => ConnectionLike<Node> | null | undefined,
  options: { pause?: boolean } = {},
) {
  const [result, reexecute] = useQuery({ query, variables, pause: options.pause })

  // Reset the cursor whenever the base variables change (tab, location, query).
  const key = JSON.stringify(variables)
  const [page, setPage] = useState<{ key: string; after: string | null }>({ key, after: null })
  const after = page.key === key ? page.after : null
  const [more] = useQuery({ query, variables: { ...variables, after } as Variables, pause: options.pause || !after })

  // While new variables load, urql keeps returning the previous ones' data
  // (another feed tab, place or search). Show that as loading, not as this list.
  const current = result.operation?.key === createRequest(query, variables).key
  const data = current ? result.data : undefined
  const connection = select(data)
  const pageInfo = connection?.pageInfo
  const loadMore = () => {
    if (pageInfo?.hasNextPage && pageInfo.endCursor && !more.fetching) setPage({ key, after: pageInfo.endCursor })
  }
  const refresh = () => {
    setPage({ key, after: null })
    reexecute({ requestPolicy: 'network-only' })
  }

  return {
    data,
    nodes: connection?.edges.map((edge) => edge.node) ?? [],
    hasMore: Boolean(pageInfo?.hasNextPage),
    loading: result.fetching && !data,
    refreshing: result.fetching && Boolean(data),
    loadingMore: more.fetching,
    error: current ? result.error : undefined,
    loadMore,
    refresh,
  }
}
