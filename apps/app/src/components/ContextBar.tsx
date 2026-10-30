import { StyleSheet, View } from 'react-native'
import { useNear } from '@/lib/location'
import { brand, useColors } from '@/theme'
import { useToast } from './Toast'
import { Touchable, Txt } from './ui'

/** "● LIVE IN METRO AREA — Use my location" strip from the original design, now functional. */
export function ContextBar({ label = 'Live in' }: { label?: string }) {
  const c = useColors()
  const toast = useToast()
  const near = useNear()

  const change = async () => {
    if (near.source === 'device') {
      await near.reset()
      toast('Showing the metro area')
    } else if (await near.locate()) {
      toast('Showing updates near you')
    } else {
      toast('Location permission is off — showing the metro area')
    }
  }

  return (
    <View style={[styles.bar, { backgroundColor: c.contextBg, borderBottomColor: c.line }]}>
      <View style={styles.live}>
        <View dataSet={{ pulse: true }} style={[styles.dot, { backgroundColor: brand.coral }]} />
        <Txt variant="micro">
          {label} {near.label}
        </Txt>
      </View>
      <Touchable onPress={() => void change()} accessibilityRole="button" hitSlop={8}>
        <Txt variant="micro" style={{ color: c.accentText, textDecorationLine: 'underline', letterSpacing: 0.4 }}>
          {near.source === 'device' ? 'Use metro area' : 'Use my location'}
        </Txt>
      </Touchable>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { minHeight: 40, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
})
