import { DEFAULT_CENTER, DEFAULT_RADIUS_KM, distanceKm, formatDistance, type GeoPoint } from '@civic/core'
import type { PostCardFieldsFragment } from '@civic/graphql'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg'
import { ContextBar } from '@/components/ContextBar'
import { PostCard } from '@/components/PostCard'
import { PageHeader, Screen } from '@/components/Screen'
import { EmptyState, Skeleton, Txt } from '@/components/ui'
import { FeedQuery } from '@/graphql/documents'
import { useHydrate } from '@/lib/graphql/hydrate'
import { prefetch } from '@/lib/graphql/prefetch'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { useNear } from '@/lib/location'
import { pageMetadata } from '@/lib/seo'
import { feedVariables } from '@/lib/variables'
import { brand, fonts, type Palette, useColors } from '@/theme'

export function loader() {
  return prefetch((fetch) => fetch(FeedQuery, feedVariables('NEARBY', DEFAULT_CENTER)))
}

export function generateMetadata() {
  return pageMetadata({ title: 'Live radar', description: 'See verified updates and official alerts plotted by distance from you.', path: '/map' })
}

const SIZE = 400
const R = 180
const RINGS = [1, 5, DEFAULT_RADIUS_KM]

/** Equirectangular projection — accurate to well under 1% at city scale. */
function project(point: GeoPoint, center: GeoPoint) {
  const east = (point.lng - center.lng) * 111.32 * Math.cos((center.lat * Math.PI) / 180)
  const north = (point.lat - center.lat) * 110.57
  // Square-root radial scale keeps nearby posts from bunching in the middle.
  const km = Math.hypot(east, north)
  const scaled = km === 0 ? 0 : (Math.sqrt(km / DEFAULT_RADIUS_KM) * R) / km
  return { x: SIZE / 2 + east * scaled, y: SIZE / 2 - north * scaled }
}

const ringRadius = (km: number) => Math.sqrt(km / DEFAULT_RADIUS_KM) * R

function markerColor(post: PostCardFieldsFragment, c: Palette) {
  if (post.kind === 'UPDATE') return c.text
  return post.severity === 'WARNING' || post.severity === 'CRITICAL' ? brand.coral : c.warning
}

export default function RadarScreen() {
  useHydrate()
  const c = useColors()
  const near = useNear()
  // Same variables as Home → Nearby, so the radar reuses that cached result.
  const feed = usePaginatedQuery(FeedQuery, feedVariables('NEARBY', near.point), (data) => data?.feed)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const plotted = useMemo(
    () =>
      feed.nodes
        .filter((post): post is PostCardFieldsFragment & { location: GeoPoint } => post.location != null)
        .map((post) => ({ post, km: distanceKm(near.point, post.location), ...project(post.location, near.point) }))
        .sort((a, b) => a.km - b.km),
    [feed.nodes, near.point],
  )
  const selected = plotted.find((p) => p.post.id === selectedId) ?? plotted[0]

  return (
    <Screen title="Live radar" header={<PageHeader title="Live radar" subtitle={`${plotted.length} updates within ${DEFAULT_RADIUS_KM} km`} />}>
      <ContextBar label="Centred on" />
      <View style={[styles.radarWrap, { borderBottomColor: c.line }]}>
        {feed.loading ? (
          <Skeleton width={320} height={320} style={{ borderRadius: 160 }} />
        ) : (
          <Svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={styles.radar} accessibilityLabel={`Radar showing ${plotted.length} nearby updates`}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill={c.contextBg} stroke={c.line} />
            <Path d={`M${SIZE / 2} ${SIZE / 2} L${SIZE / 2 + R} ${SIZE / 2} A${R} ${R} 0 0 0 ${SIZE / 2 + R * Math.cos(Math.PI / 5)} ${SIZE / 2 - R * Math.sin(Math.PI / 5)} Z`} fill={brand.lime} opacity={0.28} />
            {RINGS.map((km) => (
              <G key={km}>
                <Circle cx={SIZE / 2} cy={SIZE / 2} r={ringRadius(km)} fill="none" stroke={c.line} strokeDasharray="3 5" />
                <SvgText x={SIZE / 2 + 4} y={SIZE / 2 - ringRadius(km) + 13} fill={c.textMuted} fontSize={10} fontFamily={fonts.semibold}>
                  {km} km
                </SvgText>
              </G>
            ))}
            <Line x1={SIZE / 2 - R} y1={SIZE / 2} x2={SIZE / 2 + R} y2={SIZE / 2} stroke={c.line} />
            <Line x1={SIZE / 2} y1={SIZE / 2 - R} x2={SIZE / 2} y2={SIZE / 2 + R} stroke={c.line} />
            {plotted.map(({ post, x, y }) => {
              const active = selected?.post.id === post.id
              const color = markerColor(post, c)
              return (
                <G key={post.id} onPress={() => setSelectedId(post.id)}>
                  {active ? <Circle cx={x} cy={y} r={13} fill="none" stroke={color} strokeWidth={2} /> : null}
                  <Circle cx={x} cy={y} r={post.kind === 'UPDATE' ? 5.5 : 7} fill={color} stroke={c.surface} strokeWidth={2} />
                </G>
              )
            })}
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={7} fill={brand.ink} stroke={brand.lime} strokeWidth={3} />
          </Svg>
        )}
        <View style={styles.legend}>
          <Legend color={c.text} label="Community update" />
          <Legend color={c.warning} label="Advisory" />
          <Legend color={brand.coral} label="Warning" />
        </View>
      </View>

      {selected ? (
        <View>
          <Txt variant="micro" color="textMuted" style={styles.section}>
            Selected · {formatDistance(selected.km)} away
          </Txt>
          <PostCard post={selected.post} />
        </View>
      ) : null}

      {plotted.length > 1 ? (
        <View>
          <Txt variant="micro" color="textMuted" style={styles.section}>
            Nearest first
          </Txt>
          {plotted.map(({ post, km }) => (
            <Pressable
              key={post.id}
              onPress={() => setSelectedId(post.id)}
              style={({ hovered }) => [styles.row, { borderBottomColor: c.line }, (hovered || selected?.post.id === post.id) && { backgroundColor: c.bg }]}
              accessibilityRole="button"
              accessibilityLabel={`${post.author.displayName}, ${formatDistance(km)} away`}
            >
              <View style={[styles.rowDot, { backgroundColor: markerColor(post, c) }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="smallStrong" numberOfLines={1}>
                  {post.area ?? post.author.displayName}
                </Txt>
                <Txt variant="small" color="textMuted" numberOfLines={1}>
                  {post.body}
                </Txt>
              </View>
              <Txt variant="smallStrong" color="textMuted">
                {formatDistance(km)}
              </Txt>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!feed.loading && plotted.length === 0 ? <EmptyState icon="radar" title="All quiet nearby" body={`No located updates within ${DEFAULT_RADIUS_KM} km.`} /> : null}
    </Screen>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.rowDot, { backgroundColor: color }]} />
      <Txt variant="small" color="textMuted" style={{ fontSize: 12 }}>
        {label}
      </Txt>
    </View>
  )
}

const styles = StyleSheet.create({
  radarWrap: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 18, borderBottomWidth: 1, gap: 14 },
  radar: { width: '100%', maxWidth: 440, aspectRatio: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  section: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1 },
  rowDot: { width: 10, height: 10, borderRadius: 5 },
})
