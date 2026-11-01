export type FollowList = 'followers' | 'following'

/** Profiles live at `/@handle`, and their follow lists one level down. */
export const profilePath = (handle: string, list?: FollowList) => (list ? `/@${handle}/${list}` : `/@${handle}`)

/**
 * The handle in a profile URL's `@handle` segment. Expo Router can't match a
 * prefix within a segment, so the profile routes take the whole first segment
 * and also catch any other one no static route claims (`/nope`): those have no
 * `@` and get null.
 */
export function profileHandle(segment: string): string | null {
  return segment.startsWith('@') && segment.length > 1 ? segment.slice(1) : null
}
