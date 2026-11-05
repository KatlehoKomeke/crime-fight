import { type BountyEventKind, formatRelativeTime, formatRelativeTimeLong } from '@civic/core'
import type { BountyDetailFieldsFragment } from '@civic/graphql'
import { StyleSheet, View } from 'react-native'
import { bountyEventText, type StatusTone, toneColor } from '@/lib/bounty-copy'
import { brand, useColors } from '@/theme'
import { Icon } from '../Icon'
import { Section, Txt } from '../ui'

type Event = BountyDetailFieldsFragment['events'][number]

function eventTone(kind: BountyEventKind): StatusTone {
  switch (kind) {
    case 'FUNDED':
    case 'APPROVED':
    case 'CLAIM_VERIFIED':
    case 'PAYOUT_SENT':
    case 'PAID':
    case 'UNFROZEN':
      return 'done'
    case 'DECLINED':
    case 'CLAIM_REJECTED':
    case 'CLAIM_REJECTED_BY_POSTER':
    case 'PAYOUT_FAILED':
    case 'REFUND_FAILED':
    case 'FROZEN':
    case 'CHARGEBACK':
    case 'REPORTED':
      return 'danger'
    case 'CLAIM_SUBMITTED':
    case 'CLAIM_CONFIRMED':
    case 'CLAIM_DISPUTED':
    case 'CLAIM_ESCALATED':
    case 'CANCEL_REQUESTED':
    case 'EXPIRING':
      return 'busy'
    default:
      return 'muted'
  }
}

/**
 * What happened to the bounty, oldest first. The API names a claim event's
 * actor only to the parties (claimant, poster, admins); to everyone else a
 * claim came from "a member". Admin and system events carry no actor at all.
 */
export function ActivityTrail({ events }: { events: Event[] }) {
  const c = useColors()
  return (
    <Section title="Activity">
      {events.length === 0 ? (
        <Txt variant="small" color="textMuted" style={styles.empty}>
          Nothing yet.
        </Txt>
      ) : (
        <View accessibilityRole="list">
          {events.map((event) => {
            return (
              <View key={event.id} style={styles.row} accessibilityRole="listitem">
                <View style={[styles.dot, { backgroundColor: toneColor(eventTone(event.kind), c) }]} />
                <View style={styles.main}>
                  <Txt variant="small">{bountyEventText(event.kind)}</Txt>
                  {event.note ? (
                    <Txt variant="small" color="textMuted">
                      “{event.note}”
                    </Txt>
                  ) : null}
                  <View style={styles.byline}>
                    {event.actor ? (
                      <Txt variant="small" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {event.actor.displayName}
                      </Txt>
                    ) : event.claimId && !event.byAdmin ? (
                      <Txt variant="small" color="textMuted">
                        A member
                      </Txt>
                    ) : (
                      <View style={styles.civic}>
                        <View style={styles.mark}>
                          <Icon name="shield" size={10} color={brand.lime} />
                        </View>
                        <Txt variant="small" color="textMuted">
                          CIVIC/ONE
                        </Txt>
                      </View>
                    )}
                    <Txt variant="small" color="textMuted" accessibilityLabel={formatRelativeTimeLong(event.createdAt)}>
                      · {formatRelativeTime(event.createdAt)}
                    </Txt>
                  </View>
                </View>
              </View>
            )
          })}
        </View>
      )}
    </Section>
  )
}

const styles = StyleSheet.create({
  empty: { paddingHorizontal: 18, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 18, paddingVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  main: { flex: 1, minWidth: 0, gap: 2 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  civic: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  mark: { width: 16, height: 16, borderRadius: 8, backgroundColor: brand.ink, alignItems: 'center', justifyContent: 'center' },
})
