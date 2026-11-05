import { formatCount, formatZar } from '@civic/core'
import { Link, usePathname, useRouter } from 'expo-router'
import { useState } from 'react'
import { Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { useQuery } from 'urql'
import { HonouredBountiesQuery, ShellQuery } from '@/graphql/documents'
import { formatDate } from '@/lib/bounty-copy'
import { profilePath } from '@/lib/profile'
import { fonts, layout, radius, useColors } from '@/theme'
import { HoverLink } from '../HoverLink'
import { Icon } from '../Icon'
import { UserRow } from '../UserRow'
import { Button, Card, Skeleton, Txt } from '../ui'
import { sectionOf } from './nav'

const YEAR = new Date().getFullYear()

export function RightRail() {
  const c = useColors()
  const section = sectionOf(usePathname())
  const [{ data }] = useQuery({ query: ShellQuery })
  const Container = Platform.OS === 'web' ? View : ScrollView

  return (
    <View dataSet={{ shell: 'right' }} style={[styles.rail, { width: layout.right }]}>
      <Container style={styles.inner} role="complementary" aria-label={section === 'bounties' ? 'Bounties' : 'Community'}>
        {section === 'bounties' ? (
          <>
            <HowBountiesWorkCard />
            <HonouredCard />
            <EmergencyCard />
          </>
        ) : (
          <>
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
                {data
                  ? data.trustedSources.map((user) => <UserRow key={user.id} user={user} dense />)
                  : [0, 1, 2].map((i) => (
                      <View key={i} style={styles.sourceSkeleton}>
                        <Skeleton width={36} height={36} style={{ borderRadius: 18 }} />
                        <View style={{ flex: 1, gap: 6 }}>
                          <Skeleton width="55%" />
                          <Skeleton width="35%" height={9} />
                        </View>
                      </View>
                    ))}
              </View>
            </Card>
          </>
        )}

        <View style={styles.footer}>
          <Link href="/terms" style={[styles.footerLink, { color: c.textMuted }]}>
            Terms
          </Link>
          <Link href="/privacy" style={[styles.footerLink, { color: c.textMuted }]}>
            Privacy
          </Link>
          <Link href="/bounties/rules" style={[styles.footerLink, { color: c.textMuted }]}>
            Bounty rules
          </Link>
          {['Trust & safety', 'Accessibility'].map((label) => (
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
      <Button label="Find support" tone="accent" size="md" onPress={() => router.push(profilePath('victimsupport'))} style={{ borderRadius: radius.sm }} />
      <Txt variant="small" style={{ color: c.onInverseMuted, marginTop: 10, fontSize: 11.5 }}>
        In immediate danger? Call 10111 (SAPS) or 112 from any phone.
      </Txt>
    </Card>
  )
}

const HOW_BOUNTIES_WORK = [
  'You pay the reward in. CIVIC/ONE holds it.',
  'A claim is confirmed by you and verified by us before anything is paid.',
  'No claim? The full amount comes back to you.',
]

function HowBountiesWorkCard() {
  const c = useColors()
  const router = useRouter()
  return (
    <Card tone="inverse" style={styles.emergency}>
      <View style={styles.emergencyHead}>
        <Icon name="bounty" size={19} color={c.accent} />
        <Txt variant="title" style={{ color: c.onInverse }} accessibilityRole="header">
          How bounties work
        </Txt>
      </View>
      <View role="list" style={styles.steps}>
        {HOW_BOUNTIES_WORK.map((line, i) => (
          <View key={line} role="listitem" style={styles.step}>
            <Txt variant="label" style={[styles.stepNumber, { color: c.accent }]}>
              {i + 1}
            </Txt>
            <Txt variant="small" style={{ color: c.onInverseMuted, flex: 1 }}>
              {line}
            </Txt>
          </View>
        ))}
      </View>
      <Button label="Read the rules" tone="accent" size="md" onPress={() => router.push('/bounties/rules')} style={{ borderRadius: radius.sm }} />
    </Card>
  )
}

function HonouredCard() {
  const c = useColors()
  const [{ data, fetching }] = useQuery({ query: HonouredBountiesQuery })
  const honoured = data?.bounties.edges.map((edge) => edge.node) ?? []
  const loading = fetching && !data
  return (
    <Card style={styles.card}>
      <Txt variant="title" style={styles.cardTitle} accessibilityRole="header">
        Recently honoured
      </Txt>
      {loading
        ? [0, 1, 2].map((i) => (
            <View key={i} style={[styles.trend, { gap: 6 }]} accessibilityElementsHidden>
              <Skeleton width="30%" height={9} />
              <Skeleton width="80%" />
              <Skeleton width="45%" height={9} />
            </View>
          ))
        : null}
      {!loading && honoured.length === 0 ? (
        <Txt variant="small" color="textMuted" style={styles.trend}>
          Nothing honoured yet. Rewards that were paid out will be listed here.
        </Txt>
      ) : null}
      {honoured.map((bounty) => (
        <HoverLink key={bounty.id} href={`/bounties/${bounty.id}`} style={styles.trend} hoverStyle={{ backgroundColor: c.surfaceAlt }}>
          <Txt variant="label" color="accentText">
            {formatZar(bounty.amountCents)}
          </Txt>
          <Txt variant="smallStrong" numberOfLines={2} style={{ marginVertical: 2 }}>
            {bounty.title}
          </Txt>
          <Txt variant="small" color="textMuted" style={{ fontSize: 12 }}>
            {bounty.closedAt ? `Paid ${formatDate(bounty.closedAt)}` : 'Paid'}
          </Txt>
        </HoverLink>
      ))}
      <Link href={{ pathname: '/bounties', params: { tab: 'honoured' } }} style={[styles.more, { color: c.accentText }]}>
        See all bounties
      </Link>
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
  steps: { gap: 8, marginVertical: 12 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNumber: { width: 14, lineHeight: 18 },
  trend: { paddingVertical: 10, paddingHorizontal: 14 },
  sourceSkeleton: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  more: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 15, fontFamily: fonts.semibold, fontSize: 13 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 6, paddingVertical: 14, paddingHorizontal: 5 },
  footerLink: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
})
