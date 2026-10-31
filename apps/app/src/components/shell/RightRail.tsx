import { formatCount } from '@civic/core'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { useQuery } from 'urql'
import { ShellQuery } from '@/graphql/documents'
import { fonts, layout, radius, useColors } from '@/theme'
import { HoverLink } from '../HoverLink'
import { Icon } from '../Icon'
import { UserRow } from '../UserRow'
import { Button, Card, Skeleton, Txt } from '../ui'

const YEAR = new Date().getFullYear()

export function RightRail() {
  const c = useColors()
  const [{ data }] = useQuery({ query: ShellQuery })
  const Container = Platform.OS === 'web' ? View : ScrollView

  return (
    <View dataSet={{ shell: 'right' }} style={[styles.rail, { width: layout.right }]}>
      <Container style={styles.inner} role="complementary" aria-label="Community">
        <SearchBox />
        <EmergencyCard />

        <Card style={styles.card}>
          <Txt variant="title" style={styles.cardTitle} accessibilityRole="header">
            What’s happening
          </Txt>
          {data
            ? data.trends.map((trend) => (
                <HoverLink key={trend.topic.id} href={`/topic/${trend.topic.slug}`} style={styles.trend} hoverStyle={{ backgroundColor: c.surfaceAlt }}>
                  <Txt variant="micro" color="textMuted" style={{ letterSpacing: 0.5 }}>
                    {trend.topic.category}
                  </Txt>
                  <Txt variant="smallStrong" style={{ marginVertical: 2 }}>
                    {trend.topic.title}
                  </Txt>
                  <Txt variant="small" color="textMuted" style={{ fontSize: 12 }}>
                    {formatCount(trend.postCount)} {trend.postCount === 1 ? 'post' : 'posts'}
                  </Txt>
                </HoverLink>
              ))
            : [0, 1, 2].map((i) => (
                <View key={i} style={[styles.trend, { gap: 6 }]}>
                  <Skeleton width="30%" height={9} />
                  <Skeleton width="60%" />
                </View>
              ))}
          <Link href="/explore" style={[styles.more, { color: c.accentText }]}>
            Show more
          </Link>
        </Card>

        <Card style={[styles.card, { paddingVertical: 8 }]}>
          <Txt variant="title" style={styles.cardTitle} accessibilityRole="header">
            Trusted sources
          </Txt>
          <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}>
            {data?.trustedSources.map((user) => <UserRow key={user.id} user={user} dense />)}
          </View>
        </Card>

        <View style={styles.footer}>
          {['Terms', 'Privacy', 'Trust & safety', 'Accessibility'].map((label) => (
            <Txt key={label} variant="small" color="textMuted" style={{ fontSize: 12 }}>
              {label}
            </Txt>
          ))}
          <Txt variant="small" color="textMuted" style={{ fontSize: 12 }}>
            © {YEAR} CIVIC/ONE
          </Txt>
        </View>
      </Container>
    </View>
  )
}

// ARIA `search` landmark: valid on web, outside React Native's Role union.
const searchLandmark = { role: 'search' } as object

export function SearchBox({ initial = '' }: { initial?: string }) {
  const c = useColors()
  const router = useRouter()
  const [query, setQuery] = useState(initial)
  const [focused, setFocused] = useState(false)
  return (
    <View style={[styles.search, { backgroundColor: focused ? c.surface : c.surfaceAlt, borderColor: focused ? c.text : 'transparent' }]} {...searchLandmark}>
      <Icon name="search" size={18} color={c.textMuted} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={() => query.trim().length > 1 && router.push({ pathname: '/explore', params: { q: query.trim() } })}
        placeholder="Search CIVIC/ONE"
        placeholderTextColor={c.textMuted}
        returnKeyType="search"
        accessibilityLabel="Search CIVIC/ONE"
        // No inline outlineStyle: globalCss drops input focus outlines, and the inline
        // form serialises differently on server and client (a hydration mismatch).
        style={[styles.searchInput, { color: c.text }]}
      />
    </View>
  )
}

function EmergencyCard() {
  const c = useColors()
  const router = useRouter()
  return (
    <Card tone="inverse" style={[styles.card, styles.emergency]}>
      <View style={styles.emergencyHead}>
        <Icon name="shield" size={19} color={c.accent} />
        <Txt variant="title" style={{ color: c.onInverse }}>
          Need help now?
        </Txt>
      </View>
      <Txt variant="small" style={{ color: c.onInverseMuted, marginVertical: 10 }}>
        Connect with trauma support, victim advocates, and legal guidance — free and confidential.
      </Txt>
      <Button label="Find support" tone="accent" size="md" onPress={() => router.push('/u/victimsupport')} style={{ borderRadius: radius.sm }} />
      <Txt variant="small" style={{ color: c.onInverseMuted, marginTop: 10, fontSize: 11.5 }}>
        In immediate danger? Call 10111 (SAPS) or 112 from any phone.
      </Txt>
    </Card>
  )
}

const styles = StyleSheet.create({
  rail: Platform.OS === 'web' ? ({ position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', scrollbarWidth: 'none' } as object) : { height: '100%' },
  inner: { paddingTop: 10, paddingBottom: 30, paddingLeft: 22, paddingRight: 14 },
  search: { height: 44, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.pill, borderWidth: 1 },
  searchInput: { flex: 1, height: '100%', fontFamily: fonts.regular, fontSize: 14 },
  card: { marginTop: 14 },
  cardTitle: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },
  emergency: { padding: 16 },
  emergencyHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trend: { paddingVertical: 10, paddingHorizontal: 14 },
  more: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 15, fontFamily: fonts.semibold, fontSize: 13 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 6, paddingVertical: 14, paddingHorizontal: 5 },
})
