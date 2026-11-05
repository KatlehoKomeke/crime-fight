import type { PaymentsStatus } from '@civic/graphql'
import type { TypedDocumentNode } from '@urql/core'
import { Platform } from 'react-native'
import { useQuery } from 'urql'
import { AdminStateQuery, PaymentsStatusQuery, ShellQuery } from '@/graphql/documents'
import { useAuth } from './auth'

const describe = (status: PaymentsStatus | null) => ({ status, known: status !== null, enabled: status !== null && status !== 'DISABLED', sandbox: status === 'SANDBOX' })

/**
 * Whether bounties can be posted and paid here. Until it's known, nothing that
 * would move money is shown. For the shell and for screens without a loader:
 * it answers after hydration, from the cache if the shell query has run.
 */
export function usePaymentsStatus() {
  const [{ data }] = useQuery({ query: PaymentsStatusQuery })
  return describe(data?.paymentsStatus ?? null)
}

// On the web a loader prefetches the shell query with the page; native has no loaders and asks for the one field.
const LoadedStatusQuery = (Platform.OS === 'web' ? ShellQuery : PaymentsStatusQuery) as TypedDocumentNode<{ paymentsStatus: PaymentsStatus }, Record<string, never>>

/**
 * The same answer for a screen whose loader prefetched the shell query (call
 * it after `useHydrate`). The server render and hydration both have it, so
 * what the page says about payments is in the HTML. `usePaymentsStatus` isn't:
 * the server renders a screen before the right rail has run the shell query,
 * while the browser hydrates the screen after it, and the two would disagree.
 */
export function useLoadedPaymentsStatus() {
  const [{ data }] = useQuery({ query: LoadedStatusQuery })
  return describe(data?.paymentsStatus ?? null)
}

/** Whether the signed-in person reviews bounties. False until known. */
export function useIsAdmin(): boolean {
  const { status } = useAuth()
  const [{ data }] = useQuery({ query: AdminStateQuery, pause: status !== 'signed-in' })
  return status === 'signed-in' && Boolean(data?.viewer?.viewerIsAdmin)
}
