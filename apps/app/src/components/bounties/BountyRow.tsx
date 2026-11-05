import { formatRelativeTime, formatZar } from '@civic/core'
import type { BountyRowFieldsFragment } from '@civic/graphql'
import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { bountyStatusLabel, bountyStatusLine, bountyTone, kindLabel, toneColor } from '@/lib/bounty-copy'
import { fonts, useColors } from '@/theme'
import { HoverLink } from '../HoverLink'
import { Avatar, Txt, VerifiedBadge } from '../ui'

/** One bounty in a list: the reward first, then what it's for and where it stands. */
export function BountyRow({ bounty, children }: { bounty: BountyRowFieldsFragment; children?: ReactNode }) {
  const c = useColors()
  const status = toneColor(bountyTone(bounty.status, bounty.isExpired), c)
  const meta = [bounty.area, bountyStatusLine(bounty), bounty.claimCount > 0 ? `${bounty.claimCount} ${bounty.claimCount === 1 ? 'claim' : 'claims'}` : null].filter(Boolean).join(' · ')
  const poster = bounty.poster

  return (
    <HoverLink
      href={`/bounties/${bounty.id}`}
      accessibilityLabel={`${formatZar(bounty.amountCents)} bounty: ${bounty.title}`}
      style={[styles.row, { borderBottomColor: c.line }]}
      hoverStyle={{ backgroundColor: c.bg }}
    >
      <View style={styles.amount}>
        <Txt style={[styles.amountText, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatZar(bounty.amountCents)}
        </Txt>
        <Txt variant="micro" color="textMuted">
          reward
        </Txt>
      </View>
      <View style={styles.main}>
        <Txt variant="micro" style={{ color: status }}>
          {kindLabel(bounty.kind)} · {bountyStatusLabel(bounty)}
        </Txt>
        <Txt variant="bodyStrong" numberOfLines={2}>
          {bounty.title}
        </Txt>
        <Txt variant="small" color="textMuted" numberOfLines={1}>
          {meta}
        </Txt>
        <View style={styles.byline}>
          {poster ? (
            <>
              <Avatar initials={poster.initials} url={poster.avatarUrl} size={20} official={poster.verified && poster.role !== 'MEMBER'} />
              <Txt variant="small" numberOfLines={1} style={{ flexShrink: 1 }}>
                {poster.displayName}
              </Txt>
              {poster.verified ? <VerifiedBadge size={12} /> : null}
            </>
          ) : (
            <Txt variant="small" color="textMuted">
              A former member
            </Txt>
          )}
          <Txt variant="small" color="textMuted">
            · {formatRelativeTime(bounty.createdAt)}
          </Txt>
        </View>
        {children}
      </View>
    </HoverLink>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: 1 },
  amount: { width: 92, gap: 2, paddingTop: 2 },
  amountText: { fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.6, lineHeight: 24 },
  main: { flex: 1, minWidth: 0, gap: 3 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
})
