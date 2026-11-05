import { Platform, StyleSheet, View } from 'react-native'
import { brand, fonts, radius, useColors } from '@/theme'
import { HoverLink } from '../HoverLink'
import { Icon, type IconName } from '../Icon'
import { Txt } from '../ui'
import type { Section } from './nav'

const SECTIONS: Array<{ section: Section; label: string; icon: IconName; href: '/' | '/bounties' }> = [
  { section: 'updates', label: 'Updates', icon: 'home', href: '/' },
  { section: 'bounties', label: 'Bounties', icon: 'bounty', href: '/bounties' },
]

/**
 * The toggle between the two halves of the app, under the logo in the side
 * rail. Each half is a plain link, so the URL is the mode. The compact rail
 * shows icons only.
 */
export function SectionSwitch({ section, compact }: { section: Section; compact: boolean }) {
  const c = useColors()
  const labelProps = Platform.OS === 'web' ? { dataSet: { shellLabel: true } } : {}
  return (
    <View role="tablist" aria-label="Section" style={[styles.switch, compact && styles.switchCompact, { backgroundColor: c.surfaceAlt }]}>
      {SECTIONS.map((item) => {
        const active = item.section === section
        return (
          <HoverLink
            key={item.section}
            href={item.href}
            role="tab"
            aria-selected={active}
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            style={[styles.segment, compact && styles.segmentCompact, active && { backgroundColor: c.surface }]}
            hoverStyle={active ? undefined : { backgroundColor: c.surface }}
          >
            <Icon name={item.icon} size={17} color={active ? c.text : c.textMuted} filled={active && item.icon === 'home'} />
            {!compact ? (
              <Txt {...labelProps} style={[styles.label, { color: active ? c.text : c.textMuted, fontFamily: active ? fonts.bold : fonts.semibold }]}>
                {item.label}
              </Txt>
            ) : null}
            {active ? <View style={[styles.underline, { backgroundColor: brand.lime }]} /> : null}
          </HoverLink>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  switch: { flexDirection: 'row', padding: 3, borderRadius: radius.pill, marginHorizontal: 12, marginBottom: 14, alignSelf: 'stretch' },
  switchCompact: { flexDirection: 'column', marginHorizontal: 0, alignSelf: 'center', gap: 2 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 36, paddingHorizontal: 10, borderRadius: radius.pill, overflow: 'hidden' },
  segmentCompact: { flex: 0, width: 44, height: 40, paddingHorizontal: 0 },
  label: { fontSize: 13.5 },
  underline: { position: 'absolute', bottom: 0, width: 26, height: 3, borderRadius: 2 },
})
