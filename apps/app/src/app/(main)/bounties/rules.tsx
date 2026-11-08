import {
  BOUNTY_DURATIONS_DAYS,
  BOUNTY_EXPIRING_DAYS,
  BOUNTY_HELD_MAX_CENTS,
  BOUNTY_KIND_RULES,
  BOUNTY_KINDS,
  BOUNTY_MAX_CENTS,
  BOUNTY_MIN_CENTS,
  BOUNTY_OPEN_MAX_PER_POSTER,
  CLAIM_POSTER_RESPONSE_DAYS,
  CLAIMS_PER_DAY_MAX,
  formatZar,
  MISSING_PERSON_MAX_DAYS,
  PAYOUT_ACCOUNT_HOLD_HOURS,
  PENDING_PAYMENT_TTL_HOURS,
  PREVIEW_PAGES,
  previewPageImage,
} from '@civic/core'
import { LegalDocument, type LegalSection } from '@/components/LegalDocument'
import { PageHeader, Screen } from '@/components/Screen'
import { LEGAL } from '@/lib/legal'
import { pageMetadata } from '@/lib/seo'

export function generateMetadata() {
  return pageMetadata({ title: 'How bounties work', description: PREVIEW_PAGES.bountyRules.description, path: '/bounties/rules', image: previewPageImage('bountyRules') })
}

const contact = `[${LEGAL.email}](mailto:${LEGAL.email})`

/* The numbers come from @civic/core, where the API's validation and sweeper read them, so this page can't drift from what the code does. */
const min = formatZar(BOUNTY_MIN_CENTS)
const max = formatZar(BOUNTY_MAX_CENTS)
/** "30, 60 or 90". */
const durations = BOUNTY_DURATIONS_DAYS.join(', ').replace(/, (\d+)$/, ' or $1')
/** "3 days" for 72 hours; whole hours otherwise. */
const period = (hours: number) => (hours % 24 === 0 ? `${hours / 24} days` : `${hours} hours`)

const INTRO = `A bounty is a reward a member offers for a verifiable outcome after a crime. This page explains how bounties work in plain English. The [terms of use](/terms) are the agreement you accept when you post or claim one; if this page and the terms ever differ, the terms apply. Our [privacy policy](/privacy) explains what we keep and who sees it.`

const SECTIONS: LegalSection[] = [
  {
    heading: 'What a bounty is',
    blocks: [
      'A member who suffered a crime posts a reward: for a stolen vehicle or item recovered through the South African Police Service (SAPS), for a missing person found safe, or for information handed to SAPS. They pay the full amount in before the bounty is listed. CIVIC/ONE holds it. The money isn’t spent, lent or invested, and it goes one of two ways: to the person who honours the bounty, once we have checked their claim, the poster has confirmed it or had the chance to object, and we have verified it; or back to the poster.',
      'A bounty is not a police case, and nobody at SAPS sees it. It doesn’t replace reporting the crime, and we don’t investigate crimes, recover property or search for people. In an emergency, call 10111 for the police, or 112 from a mobile phone.',
    ],
  },
  {
    heading: 'What it can be for, and what it can’t',
    blocks: [
      'A bounty is for one of three outcomes:',
      BOUNTY_KINDS.map((kind) => `${BOUNTY_KIND_RULES[kind].label}: ${BOUNTY_KIND_RULES[kind].fulfilled}`),
      'A bounty is never for a person. It describes what was taken, who is missing or which case you want information on, and never who you think is responsible:',
      [
        'Don’t name, describe or picture anyone you suspect, and don’t ask people to find them. We review bounties that do, and remove them.',
        'Don’t include anyone’s ID number, phone number or home address, including your own.',
        'A bounty can’t be conditional on anyone withdrawing a complaint, dropping charges or not talking to the police. You may not promise, in a bounty or anywhere else, that you won’t prosecute.',
        'A bounty is never a payment to whoever has the property or the person. If someone demands money for a return, that is a crime: contact SAPS.',
      ],
    ],
  },
  {
    heading: 'Missing people',
    blocks: [
      `A bounty for a missing person is a reward for them being found safe and SAPS being told. We review every missing-person bounty before it is listed, usually within a day, and we won’t list one that could put someone at risk, including people who may have left a violent home. It stays open for at most ${MISSING_PERSON_MAX_DAYS} days and can’t be extended.`,
      'Only a parent, legal guardian, adult family member, spouse or partner may post one, and only once SAPS has been told and has opened a case. For a child, only a parent or legal guardian. Say only what SAPS has agreed can be shared: the suburb and where the person was last seen, never the home address, their school or their routine. If a missing-person bounty describes you, or someone you act for, tell us and we will take it down.',
      'Sightings go to SAPS only. If you see the person, don’t approach them, and don’t post or message where they are. Call 10111 with the case number shown on the bounty. Afterwards you can submit a claim here saying which station you spoke to and when.',
    ],
  },
  {
    heading: 'Posting and paying',
    blocks: [
      'To post a bounty you must:',
      [
        'be 18 or older, and be the owner of the property, the victim of the crime, or the missing person’s parent, legal guardian, adult family member, spouse or partner;',
        'have reported it to SAPS. A missing-person or information bounty needs the SAPS case (CAS) number; on a property bounty it is optional, but it helps claimants and our reviewers;',
        `offer between ${min} and ${max}, in whole rands;`,
        'describe the outcome you want rather than a person, and tell the truth about what happened and what has already been recovered.',
      ],
      `You pay the reward by card through Paystack, our payment provider, when you post. We never see your card details. The bounty is listed once the payment settles, usually within a minute. If it isn’t paid within ${PENDING_PAYMENT_TTL_HOURS} hours, it is dropped and nothing is charged.`,
      `A bounty stays open for ${durations} days, whichever you choose; a missing-person bounty for at most ${MISSING_PERSON_MAX_DAYS}. You can have ${BOUNTY_OPEN_MAX_PER_POSTER} bounties open at a time, and we hold at most ${formatZar(BOUNTY_HELD_MAX_CENTS)} for one person. Missing-person bounties, and any bounty our checks flag, are reviewed before they go public. If we can’t list one, the full amount is refunded.`,
    ],
  },
  {
    heading: 'Claims',
    blocks: [
      'If you honoured a bounty, you can claim it from its page. Your account must be at least three days old, and you must first add the bank account the reward should be paid into, under Payouts in [Settings](/settings). You can’t claim your own bounty, a bounty for a crime you were involved in, or a recovery of property you bought, received or kept knowing or suspecting it was stolen.',
      'CIVIC/ONE’s reviewers see your claim first. The poster sees it, and who sent it, only once we have checked and approved it. The public never does. Say what you did and when, and what you handed to SAPS and where. For each kind of bounty, a claim must say:',
      BOUNTY_KINDS.map((kind) => `${BOUNTY_KIND_RULES[kind].label}: ${BOUNTY_KIND_RULES[kind].evidence}`),
      'Don’t include anyone’s ID number, phone number or address, and don’t name people you suspect: describe what you gave SAPS instead. Property comes back through SAPS. Never buy it back from whoever has it: receiving stolen property is an offence, and we don’t pay for it.',
      `You can claim a bounty once, and submit up to ${CLAIMS_PER_DAY_MAX} claims a day. We pay one claim per bounty: the one we approve and verify. If more than one person helped, agree between you how to share the reward before you claim, because we pay only the account on the claim.`,
    ],
  },
  {
    heading: 'Checking, confirming and paying',
    blocks: [
      'When a claim comes in, a CIVIC/ONE administrator checks it first, for example against the SAPS case and with the station the claimant names. The poster is told that a claim came in, but not what it says or who sent it. If we reject a claim, the claimant sees the reason and the poster never sees the claim.',
      `Once we approve a claim, the poster sees it and has ${CLAIM_POSTER_RESPONSE_DAYS} days to confirm that the outcome happened, or to object and say why. If the poster doesn’t answer, that counts as no objection. If the poster objects, an administrator looks at the reason and decides: we have the final say, and we may pay the claim anyway. While an approved claim is being decided, the bounty doesn’t take new claims.`,
      'A cooling-off period runs from our approval before anything can be paid:',
      BOUNTY_KINDS.map((kind) => `${BOUNTY_KIND_RULES[kind].label}: ${period(BOUNTY_KIND_RULES[kind].cooldownHours)}`),
      'Then an administrator verifies the claim and releases the payment. They may ask either of you for more detail, and they may contact SAPS. Money moves only under dual control: an administrator checks every claim and releases every payment, the poster confirms or objects in between, and an administrator never decides a claim on a bounty they are part of. Our administrators are named members we appoint; they are not police officers.',
    ],
  },
  {
    heading: 'Payouts',
    blocks: [
      `A verified reward is paid in full to a South African bank account in the claimant’s own name, added under Payouts in [Settings](/settings). We send the account details to our payment provider and keep only the bank, the name on the account and the last four digits. A new account can’t receive money until ${PAYOUT_ACCOUNT_HOLD_HOURS} hours after you add it, so add one before you need it. We don’t knowingly pay into anyone else’s account.`,
      'Rewards are usually taxable income for the person who receives them. Declaring it is their responsibility.',
    ],
  },
  {
    heading: 'Cancelling, expiring and refunds',
    blocks: [
      'You can cancel a bounty from its page at any time until someone submits a claim, and the full amount is refunded. Once a claim is in, the bounty stays open until that claim is decided. If you still want to cancel, ask us from the bounty page and an administrator decides.',
      `We remind you ${BOUNTY_EXPIRING_DAYS} days before a bounty ends. If it ends without a claim we approved, it expires and the full amount is refunded. We also refund in full when we decline to list a bounty, when a bounty is cancelled, and when every claim on it has been rejected and it has closed.`,
      'Refunds go back to the card you paid with. Nothing is kept as a balance on CIVIC/ONE. Your bank can take a few working days to show it.',
    ],
  },
  {
    heading: 'Disputes',
    blocks: [
      'If the poster objects to a claim we approved, an administrator looks at the claim, the poster’s reason and anything either of you adds, and may pay the claim anyway. If a claim of yours is rejected, you see the reason.',
      'An administrator’s decision ends the matter on CIVIC/ONE, and we release or refund the money accordingly. It doesn’t take away any right you have to go to the courts, to a consumer ombud or to SAPS. We may put a bounty on hold, and keep the money for longer, while we look into possible fraud, a report that it puts someone at risk, a payment dispute with a bank, or a request from SAPS or a court.',
    ],
  },
  {
    heading: 'Fees',
    blocks: [
      'We don’t charge a fee for bounties at the moment. If we start to, we will show the fee before you pay, it will be charged on top of the reward, and it will be refunded with the reward when a bounty is refunded. Our payment provider charges us processing fees; we don’t pass them on.',
    ],
  },
  {
    heading: 'Before payments are switched on',
    blocks: [
      'Until we announce that bounty payments are on, the [Bounties](/bounties) section is visible but nobody can post a bounty or be paid one. These rules apply from the moment payments are switched on.',
    ],
  },
  {
    heading: 'Your safety',
    blocks: [
      'No reward is worth getting hurt. Never confront, follow or detain anyone, never go to collect property yourself, and never arrange to meet someone over a bounty. If a vehicle, an item or a person is in front of you right now, call 10111, or 112 from a mobile. We don’t pay for recoveries that involved confronting anyone, and we remove bounties that encourage it.',
    ],
  },
  {
    heading: 'Contact',
    blocks: [`${LEGAL.operator} · ${contact}`],
  },
]

export default function BountyRulesScreen() {
  return (
    <Screen title="How bounties work" header={<PageHeader title="How bounties work" subtitle={`Updated ${LEGAL.updated.bountyRules}`} back />}>
      <LegalDocument intro={INTRO} sections={SECTIONS} />
    </Screen>
  )
}
