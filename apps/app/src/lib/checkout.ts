import * as Linking from 'expo-linking'
import type { useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { Platform } from 'react-native'

type Router = ReturnType<typeof useRouter>

/** The bounty's return page, which confirms the payment with the API. */
export const paidPath = (bountyId: string) => `/bounties/${bountyId}/paid`

/**
 * Hands the poster to the payment provider and brings them back to the
 * bounty's return page. On the web the provider redirects back itself; on
 * native the checkout opens in an auth session and the app goes to the return
 * page whatever happened (paid, cancelled, dismissed), so a lost redirect
 * never loses a bounty: the return page polls and offers to pay again.
 *
 * The sandbox provider's "checkout" is the return page itself (same origin,
 * `?sandbox=1`), which then offers to pretend the payment succeeded or failed.
 */
export async function openCheckout(router: Router, bountyId: string, checkoutUrl: string): Promise<void> {
  const url = new URL(checkoutUrl)
  const reference = url.searchParams.get('reference') ?? ''
  if (url.pathname === paidPath(bountyId) && url.searchParams.get('sandbox') === '1') {
    router.replace({ pathname: '/bounties/[id]/paid', params: { id: bountyId, reference, sandbox: '1' } })
    return
  }
  if (Platform.OS === 'web') {
    window.location.assign(checkoutUrl)
    return
  }
  const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, Linking.createURL(paidPath(bountyId)))
  const returned = result.type === 'success' ? new URL(result.url).searchParams.get('reference') : null
  router.replace({ pathname: '/bounties/[id]/paid', params: { id: bountyId, reference: returned ?? reference } })
}
