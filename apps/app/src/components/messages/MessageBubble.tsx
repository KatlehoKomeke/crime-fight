import { StyleSheet, View } from 'react-native'
import { radius, useColors } from '@/theme'
import { Touchable, Txt } from '../ui'

export interface ThreadItem {
  key: string
  body: string
  createdAt: string
  mine: boolean
  /** Messages you've sent that the API hasn't confirmed yet. */
  status?: 'sending' | 'failed'
}

const RUN_GAP_MS = 5 * 60_000
const time = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' })
const dayAndTime = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const stamp = (iso: string) => {
  const date = new Date(iso)
  return date.toDateString() === new Date().toDateString() ? time.format(date) : dayAndTime.format(date)
}

/** A bubble shows its time when it ends a run: the next message is the other person's, or comes over five minutes later. */
export const endsRun = (item: ThreadItem, next: ThreadItem | undefined) =>
  !next || next.mine !== item.mine || new Date(next.createdAt).getTime() - new Date(item.createdAt).getTime() > RUN_GAP_MS

export function MessageBubble({ item, showTime, onRetry }: { item: ThreadItem; showTime: boolean; onRetry?: () => void }) {
  const c = useColors()
  return (
    <View style={[styles.line, item.mine ? styles.mine : styles.theirs, showTime && styles.runEnd]}>
      <View
        style={[
          styles.bubble,
          item.mine ? [styles.bubbleMine, { backgroundColor: c.primary }] : [styles.bubbleTheirs, { backgroundColor: c.surfaceAlt }],
          item.status === 'sending' && { opacity: 0.6 },
        ]}
      >
        <Txt selectable style={{ color: item.mine ? c.onPrimary : c.text }}>
          {item.body}
        </Txt>
      </View>
      {item.status === 'failed' ? (
        <Touchable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Not sent. Tap to try again">
          <Txt variant="small" style={{ color: c.danger }}>
            Not sent · Tap to try again
          </Txt>
        </Touchable>
      ) : showTime ? (
        <Txt variant="small" color="textMuted">
          {item.status === 'sending' ? 'Sending…' : stamp(item.createdAt)}
        </Txt>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  line: { maxWidth: '82%', gap: 3, marginTop: 3 },
  mine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  runEnd: { marginBottom: 9 },
  bubble: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.lg },
  bubbleMine: { borderBottomRightRadius: radius.sm },
  bubbleTheirs: { borderBottomLeftRadius: radius.sm },
})
