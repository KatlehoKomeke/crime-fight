import { BOUNTY_KIND_RULES, BOUNTY_KINDS, type BountyKind } from '@civic/core'
import { StyleSheet, View } from 'react-native'
import { Chip } from '../ui'

/** Which kind of bounty: a filter on the board (with "All"), a choice on the form (without). */
export function KindChips({ value, onChange, all, label = 'Kind of bounty' }: { value: BountyKind | null; onChange: (kind: BountyKind | null) => void; all?: boolean; label?: string }) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {all ? <Chip label="All" selected={value === null} onPress={() => onChange(null)} /> : null}
      {BOUNTY_KINDS.map((kind) => (
        <Chip key={kind} label={BOUNTY_KIND_RULES[kind].short} selected={value === kind} onPress={() => onChange(kind)} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
})
