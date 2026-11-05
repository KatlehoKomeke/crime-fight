import { formatRelativeTime, formatZar } from '@civic/core'
import type { MyClaimsQuery } from '@civic/graphql'
import { StyleSheet, View } from 'react-native'
import { claimStatusLabel, claimTone, toneColor } from '@/lib/bounty-copy'
import { fonts, useColors } from '@/theme'
import { HoverLink } from '../HoverLink'
import { Txt } from '../ui'

export type MyClaim = MyClaimsQuery['myClaims']['edges'][number]['node']

/** One of your claims: the reward it's for and where the claim stands. Opens the bounty. */
export function ClaimRow({ claim }: { claim: MyClaim }) {
  const c = useColors()
  const { bounty } = claim
  return (
    <HoverLink href={`/bounties/${bounty.id}`} accessibilityLabel={`Your claim on ${bounty.title}: ${claimStatusLabel(claim.status)}`} style={[styles.row, { borderBottomColor: c.line }]} hoverStyle={{ backgroundColor: c.bg }}>
      <View style={styles.amount}>
        <Txt style={[styles.amountText, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatZar(bounty.amountCents)}
        </Txt>
        <Txt variant="micro" color="textMuted">
          reward
        </Txt>
      </View>
      <View style={styles.main}>
        <Txt variant="micro" style={{ color: toneColor(claimTone(claim.status), c) }}>
          {claimStatusLabel(claim.status)}
        </Txt>
        <Txt variant="bodyStrong" numberOfLines={2}>
          {bounty.title}
        </Txt>
        <Txt variant="small" color="textMuted" numberOfLines={1}>
          Claimed {formatRelativeTime(claim.createdAt)}
          {bounty.poster ? ` · posted by ${bounty.poster.displayName}` : ''}
        </Txt>
      </View>
    </HoverLink>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: 1 },
  amount: { width: 92, gap: 2, paddingTop: 2 },
  amountText: { fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.6, lineHeight: 24 },
  main: { flex: 1, minWidth: 0, gap: 3 },
})
