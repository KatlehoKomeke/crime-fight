import { type BountyStatus, formatZar } from '@civic/core'
import { StyleSheet, View } from 'react-native'
import { kindLabel, timeLeft } from '@/lib/bounty-copy'
import { useColors } from '@/theme'
import { HoverLink } from '../HoverLink'
import { Icon } from '../Icon'
import { Txt } from '../ui'

export interface BountyChipData {
  id: string
  amountCents: number
  status: BountyStatus
  kind: 'PROPERTY' | 'MISSING_PERSON' | 'INFORMATION'
  expiresAt?: string | null
}

function line(bounty: BountyChipData): string {
  switch (bounty.status) {
    case 'OPEN':
      return bounty.expiresAt ? `${kindLabel(bounty.kind)} · ${timeLeft(bounty.expiresAt)}` : kindLabel(bounty.kind)
    case 'AWAITING_VERIFICATION':
    case 'RELEASING':
      return 'A claim is being verified'
    case 'PAID':
      return 'Honoured and paid'
    default:
      return 'Closed'
  }
}

/** The reward attached to an update, on the post card and in notifications. Opens the bounty. */
export function BountyChip({ bounty }: { bounty: BountyChipData }) {
  const c = useColors()
  const open = bounty.status === 'OPEN'
  return (
    <HoverLink
      href={`/bounties/${bounty.id}`}
      accessibilityLabel={`${formatZar(bounty.amountCents)} bounty, ${line(bounty)}`}
      style={[styles.chip, { borderColor: c.line, borderLeftColor: open ? c.accentText : c.textMuted, backgroundColor: c.bg }]}
      hoverStyle={{ backgroundColor: c.surfaceAlt }}
    >
      <Icon name="bounty" size={18} color={open ? c.accentText : c.textMuted} />
      <View style={{ flexShrink: 1 }}>
        <Txt variant="label">{formatZar(bounty.amountCents)} bounty</Txt>
        <Txt variant="micro" color="textMuted" style={{ letterSpacing: 0.6 }}>
          {line(bounty)}
        </Txt>
      </View>
    </HoverLink>
  )
}

const styles = StyleSheet.create({
  chip: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderLeftWidth: 3, alignSelf: 'stretch' },
})
