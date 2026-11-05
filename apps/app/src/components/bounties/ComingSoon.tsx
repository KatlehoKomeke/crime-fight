import { StyleSheet, View } from 'react-native'
import { radius, useColors } from '@/theme'
import { Icon } from '../Icon'
import { Txt } from '../ui'

/** Shown wherever money would move while payments are switched off (prod until the legal gate clears). */
export function ComingSoon() {
  const c = useColors()
  return (
    <View style={[styles.banner, { backgroundColor: c.warningTint, borderBottomColor: c.line }]} accessibilityRole="summary">
      <Icon name="bounty" size={18} color={c.warning} />
      <Txt variant="small" style={{ flex: 1, color: c.text }}>
        <Txt variant="smallStrong">Bounties are coming soon. </Txt>
        You’ll be able to post a reward for a recovery, a safe return or information to SAPS once payments are switched on. You can read how they’ll work in the
        meantime.
      </Txt>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, paddingHorizontal: 18, borderBottomWidth: 1, borderRadius: radius.sm },
})
