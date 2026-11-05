import { BOUNTY_LISTED_STATUSES, BOUNTY_NOTE_MAX, BOUNTY_REPORT_LABEL, BOUNTY_REPORT_REASONS, type BountyReportReason, CLAIM_DISPUTE_DAYS, CLAIM_LIVE_STATUSES, formatZar } from '@civic/core'
import type { BountyDetailFieldsFragment } from '@civic/graphql'
import { useState } from 'react'
import { Modal, Platform, Pressable, Share, StyleSheet, View } from 'react-native'
import { type CombinedError, useMutation } from 'urql'
import { CancelBounty, ReportBounty, RequestBountyCancellation } from '@/graphql/documents'
import { getConfig } from '@/lib/config'
import { radius, useColors } from '@/theme'
import { ConfirmDialog } from '../ConfirmDialog'
import { Icon, type IconName } from '../Icon'
import { useToast } from '../Toast'
import { Button, Chip, Field, IconButton, Input, Touchable, Txt } from '../ui'
import { addDays, inFuture, NoteDialog } from './ClaimCard'
import { usePayNow } from './StatusStrip'

type Bounty = BountyDetailFieldsFragment

export const bountyUrl = (id: string) => `${getConfig().siteUrl}/bounties/${id}`

/** The system share sheet where there is one; otherwise the link goes to the clipboard. */
export async function shareBounty(bounty: Pick<Bounty, 'id' | 'amountCents' | 'title'>, toast: (message: string) => void): Promise<void> {
  const url = bountyUrl(bounty.id)
  const text = `${formatZar(bounty.amountCents)} bounty: ${bounty.title}`
  if (Platform.OS !== 'web') {
    await Share.share({ message: `${text}\n\n${url}`, url })
  } else if (typeof navigator.share === 'function') {
    await navigator.share({ title: `${text} on CIVIC/ONE`, text, url }).catch(() => undefined)
  } else {
    await navigator.clipboard?.writeText(url)
    toast('Link copied')
  }
}

/** Claims the API counts against cancelling: live ones, and poster rejections the claimant can still dispute. */
const blockingClaims = (bounty: Bounty) =>
  bounty.claims.filter(
    (claim) => CLAIM_LIVE_STATUSES.includes(claim.status) || (claim.status === 'REJECTED_BY_POSTER' && claim.rejectedAt !== null && inFuture(addDays(claim.rejectedAt, CLAIM_DISPUTE_DAYS))),
  ).length

type Dialog = 'report' | 'cancel' | 'askCancel' | 'delete' | null

/** The header's "more" menu: the link, reporting for members, cancelling and paying for the poster. */
export function BountyMenu({ bounty, poster, signedIn }: { bounty: Bounty; poster: boolean; signedIn: boolean }) {
  const c = useColors()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const { payNow } = usePayNow(bounty.id)
  const listed = BOUNTY_LISTED_STATUSES.includes(bounty.status)

  const items: Array<{ icon: IconName; label: string; danger?: boolean; run: () => void }> = [
    {
      icon: 'share',
      label: 'Copy link',
      run: () => {
        const url = bountyUrl(bounty.id)
        if (Platform.OS === 'web') void navigator.clipboard?.writeText(url)
        else void Share.share({ message: url, url })
        toast('Link copied')
      },
    },
  ]
  if (signedIn && !poster && listed) items.push({ icon: 'shield', label: 'Report this bounty', run: () => setDialog('report') })
  if (poster) {
    if (bounty.status === 'PENDING_PAYMENT') {
      items.push({ icon: 'bounty', label: 'Pay now', run: payNow })
      items.push({ icon: 'trash', label: 'Delete unpaid bounty', danger: true, run: () => setDialog('delete') })
    } else if (bounty.status === 'OPEN' || bounty.status === 'PENDING_REVIEW' || bounty.status === 'AWAITING_VERIFICATION') {
      const blocked = bounty.status === 'AWAITING_VERIFICATION' || blockingClaims(bounty) > 0
      items.push(blocked ? { icon: 'mail', label: 'Ask to cancel', run: () => setDialog('askCancel') } : { icon: 'close', label: 'Cancel bounty', danger: true, run: () => setDialog('cancel') })
    }
  }

  return (
    <>
      <IconButton icon="dots" label="More options" onPress={() => setOpen(true)} />
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: c.overlay }]} onPress={() => setOpen(false)} accessibilityLabel="Close menu">
          <View style={[styles.menu, { backgroundColor: c.surface, borderColor: c.line }]} role="menu">
            {items.map((item) => (
              <Touchable
                key={item.label}
                onPress={() => {
                  setOpen(false)
                  item.run()
                }}
                accessibilityRole="menuitem"
                style={styles.menuItem}
                hoverStyle={{ backgroundColor: c.surfaceAlt }}
              >
                <Icon name={item.icon} size={18} color={item.danger ? c.danger : c.text} />
                <Txt variant="bodyStrong" style={{ color: item.danger ? c.danger : c.text }}>
                  {item.label}
                </Txt>
              </Touchable>
            ))}
          </View>
        </Pressable>
      </Modal>
      <ReportDialog open={dialog === 'report'} bountyId={bounty.id} onClose={() => setDialog(null)} />
      {poster ? <PosterDialogs bounty={bounty} dialog={dialog} onClose={() => setDialog(null)} /> : null}
    </>
  )
}

function ReportDialog({ open, bountyId, onClose }: { open: boolean; bountyId: string; onClose: () => void }) {
  const toast = useToast()
  const [reason, setReason] = useState<BountyReportReason | null>(null)
  const [note, setNote] = useState('')
  const [{ fetching }, report] = useMutation(ReportBounty)
  const over = note.length > BOUNTY_NOTE_MAX

  const close = () => {
    setReason(null)
    setNote('')
    onClose()
  }

  const send = async () => {
    if (!reason) return
    const result = await report({ id: bountyId, reason, note: note.trim() || undefined })
    toast(result.error ? (result.error.graphQLErrors[0]?.message ?? 'Couldn’t send the report. Try again.') : 'Thanks. We’ll look at it.')
    close()
  }

  return (
    <ConfirmDialog
      open={open}
      title="Report this bounty?"
      body="Only CIVIC/ONE sees your report. The poster isn’t told who sent it."
      confirmLabel="Send report"
      loading={fetching}
      disabled={!reason || over}
      onConfirm={() => void send()}
      onClose={close}
    >
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Reason">
        {BOUNTY_REPORT_REASONS.map((value) => (
          <Chip key={value} label={BOUNTY_REPORT_LABEL[value]} selected={reason === value} onPress={() => setReason(value)} />
        ))}
      </View>
      <Field label="Anything else? (optional)" count={`${note.length}/${BOUNTY_NOTE_MAX}`} over={over}>
        <Input value={note} onChangeText={setNote} multiline maxLength={BOUNTY_NOTE_MAX + 50} accessibilityLabel="Anything else" placeholder="What we should look at" invalid={over} />
      </Field>
    </ConfirmDialog>
  )
}

function PosterDialogs({ bounty, dialog, onClose }: { bounty: Bounty; dialog: Dialog; onClose: () => void }) {
  const toast = useToast()
  const [cancelling, cancel] = useMutation(CancelBounty)
  const [asking, ask] = useMutation(RequestBountyCancellation)
  const amount = formatZar(bounty.amountCents)

  const run = async (action: () => Promise<{ error?: CombinedError }>, done: string, fallback: string) => {
    const result = await action()
    toast(result.error ? (result.error.graphQLErrors[0]?.message ?? fallback) : done)
    onClose()
  }

  return (
    <>
      <ConfirmDialog
        open={dialog === 'cancel'}
        title="Cancel this bounty?"
        body={`${amount} is refunded to the card you paid with, usually within a few working days.`}
        confirmLabel="Cancel and refund"
        confirmTone="danger"
        cancelLabel="Keep it open"
        loading={cancelling.fetching}
        onConfirm={() => void run(() => cancel({ id: bounty.id }), 'Bounty cancelled. Your refund is on its way.', 'Couldn’t cancel the bounty. Try again.')}
        onClose={onClose}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Delete this unpaid bounty?"
        body="Nothing has been charged. The bounty is removed and can’t be paid for later."
        confirmLabel="Delete"
        confirmTone="danger"
        cancelLabel="Keep it"
        loading={cancelling.fetching}
        onConfirm={() => void run(() => cancel({ id: bounty.id }), 'Bounty deleted.', 'Couldn’t delete the bounty. Try again.')}
        onClose={onClose}
      />
      <NoteDialog
        open={dialog === 'askCancel'}
        title="Ask CIVIC/ONE to cancel?"
        body="A claim is being decided, so only CIVIC/ONE can cancel this bounty now. Tell us why you want it cancelled and we’ll look at it."
        label="Why you want to cancel"
        confirmLabel="Send request"
        loading={asking.fetching}
        onConfirm={(note) => void run(() => ask({ id: bounty.id, note }), 'We’ll look at it and let you know.', 'Couldn’t send the request. Try again.')}
        onClose={onClose}
      />
    </>
  )
}

export function ShareButton({ bounty }: { bounty: Pick<Bounty, 'id' | 'amountCents' | 'title'> }) {
  const toast = useToast()
  return <Button label="Share" tone="outline" icon="share" size="lg" onPress={() => void shareBounty(bounty, toast)} />
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  menu: { width: '100%', maxWidth: 340, borderRadius: radius.lg, borderWidth: 1, paddingVertical: 6, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
})
