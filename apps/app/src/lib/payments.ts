import { useQuery } from 'urql'
import { AdminStateQuery, PaymentsStatusQuery } from '@/graphql/documents'
import { useAuth } from './auth'

/**
 * Whether bounties can be posted and paid here. The shell query prefetches
 * the same field, so this answers from the cache on the first client render.
 * Until it's known, nothing that would move money is shown.
 */
export function usePaymentsStatus() {
  const [{ data }] = useQuery({ query: PaymentsStatusQuery })
  const status = data?.paymentsStatus ?? null
  return { status, known: status !== null, enabled: status !== null && status !== 'DISABLED', sandbox: status === 'SANDBOX' }
}

/** Whether the signed-in person reviews bounties. False until known. */
export function useIsAdmin(): boolean {
  const { status } = useAuth()
  const [{ data }] = useQuery({ query: AdminStateQuery, pause: status !== 'signed-in' })
  return status === 'signed-in' && Boolean(data?.viewer?.viewerIsAdmin)
}
