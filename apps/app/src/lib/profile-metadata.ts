import { formatCount, TRUST_BADGE_LABEL, type TrustBadge } from '@civic/core'
import type { ProfileMetadataQuery } from '@civic/graphql'
import { type FollowList, profilePath } from './profile'
import { excerpt, pageMetadata } from './seo'

type Profile = NonNullable<ProfileMetadataQuery['user']>

const counted = (n: number, one: string) => `${formatCount(n)} ${n === 1 ? one : `${one}s`}`
const sentence = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`)

/** A profile's page, or one of its follow lists, which share the profile's card. */
export function profileMetadata(user: Profile, list?: FollowList) {
  const name = `${user.displayName} (@${user.handle})`
  if (list) {
    return pageMetadata({
      title: list === 'followers' ? `People following ${name}` : `People followed by ${name}`,
      description: list === 'followers' ? `See who follows ${name} on CIVIC/ONE.` : `See who ${name} follows on CIVIC/ONE.`,
      path: profilePath(user.handle, list),
      image: user.previewImage,
      noindex: true,
    })
  }
  const badge = user.trustBadge ? ` · ${TRUST_BADGE_LABEL[user.trustBadge as TrustBadge]}` : ''
  const about = sentence(user.bio.trim() || `Local safety updates from ${user.displayName} on CIVIC/ONE`)
  return pageMetadata({
    title: `${name}${badge}`,
    description: excerpt(`${about} ${counted(user.postCount, 'post')} · ${counted(user.followerCount, 'follower')}.`),
    path: profilePath(user.handle),
    type: 'profile',
    image: user.previewImage,
  })
}
