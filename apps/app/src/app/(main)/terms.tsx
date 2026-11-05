import {
  BOUNTY_DURATIONS_DAYS,
  BOUNTY_MAX_CENTS,
  BOUNTY_MIN_CENTS,
  CLAIM_DISPUTE_DAYS,
  CLAIM_POSTER_RESPONSE_DAYS,
  formatZar,
  MISSING_PERSON_MAX_DAYS,
  PAYOUT_ACCOUNT_HOLD_HOURS,
  PREVIEW_PAGES,
  previewPageImage,
} from '@civic/core'
import { LegalDocument, type LegalSection } from '@/components/LegalDocument'
import { PageHeader, Screen } from '@/components/Screen'
import { LEGAL } from '@/lib/legal'
import { pageMetadata } from '@/lib/seo'

export function generateMetadata() {
  return pageMetadata({ title: 'Terms of use', description: PREVIEW_PAGES.terms.description, path: '/terms', image: previewPageImage('terms') })
}

const contact = `[${LEGAL.email}](mailto:${LEGAL.email})`

// The limits come from the same constants the API enforces, so the terms never promise something the code refuses.
const min = formatZar(BOUNTY_MIN_CENTS)
const max = formatZar(BOUNTY_MAX_CENTS)
const longestDays = Math.max(...BOUNTY_DURATIONS_DAYS)

const INTRO = `These terms are the agreement between you and ${LEGAL.operator} for using CIVIC/ONE on the web and in our apps. By signing in, you accept them. Please also read our [privacy policy](/privacy). If you post or claim a bounty, the Bounties sections below also apply.`

const SECTIONS: LegalSection[] = [
  {
    heading: 'Not an emergency service',
    blocks: [
      'CIVIC/ONE is a community information service. A crime you report here is shared with your neighbourhood so people can stay safe; it is not reported to the police. Nobody monitors CIVIC/ONE around the clock, and it is not a way to get help. In an emergency, call 10111 for the police, or 112 from a mobile phone. To open a case, report the crime to the South African Police Service as well.',
    ],
  },
  {
    heading: 'Who can use CIVIC/ONE',
    blocks: [
      [
        'You must be 18 or older.',
        'Sign in with your own Google or Apple account, and keep only one CIVIC/ONE account.',
        'You are responsible for what happens on your account. Tell us straight away if you think someone else has used it.',
      ],
    ],
  },
  {
    heading: 'What you post',
    blocks: [
      'CIVIC/ONE only works if people can trust what they read. When you post, reply or send a message:',
      [
        'Share what you saw or know first-hand, and say when something is unconfirmed.',
        'Don’t publish other people’s personal information, such as ID numbers, card numbers, phone numbers or home addresses, or photos that identify victims or children.',
        'Don’t accuse identifiable people of crimes. Report suspects to the police instead.',
        'Don’t threaten or harass anyone, encourage violence or vigilante action, or post hate speech.',
        'Don’t pretend to be someone else, especially the police, officials, newsrooms or support services.',
        'Don’t post false reports, spam or anything illegal.',
        'Don’t post a bounty, or claim one, for anything these terms say bounties can’t be used for. A bounty may describe what was taken or who is missing, never who you think did it.',
      ],
      'The composer warns you when a post looks like it contains personal details. You decide whether to post it, and you are responsible for what you share.',
    ],
  },
  {
    heading: 'Verified sources',
    blocks: [
      'Verified badges mark officials, newsrooms and support services whose identity we have confirmed. Only verified officials and newsrooms can publish alerts and advisories. A badge confirms who is posting, not that every post is correct.',
    ],
  },
  {
    heading: 'Messages',
    blocks: [
      'Only members who follow each other can message. Don’t use messages to harass anyone. Unfollowing someone stops them from messaging you. If either of you deletes your account, the conversation is deleted for both of you.',
    ],
  },
  {
    heading: 'Bounties',
    blocks: [
      'A bounty is a reward a member offers for a verifiable outcome after a crime: a stolen vehicle or item recovered and returned, a missing person found safe, or information handed to the South African Police Service (SAPS) that leads to an arrest. The member who offers it (the poster) pays the amount in advance. We hold it, and we pay it out only once the outcome has been confirmed by the poster and verified by us. Otherwise we refund it.',
      'We are an intermediary. A bounty is the poster’s offer, not ours. We don’t investigate crimes, recover property or search for people, we don’t guarantee that any bounty will be claimed or paid, and we can’t make anyone honour a promise made outside CIVIC/ONE. A bounty is not a police case and nobody at SAPS sees it. Report every crime and every missing person to SAPS first. In an emergency, call 10111, or 112 from a mobile phone.',
      'We are not a bank. Money held for a bounty doesn’t earn interest, isn’t a deposit or an investment, and is held only so that it can be paid out or refunded under these terms.',
    ],
  },
  {
    heading: 'Posting a bounty',
    blocks: [
      'To post a bounty you must:',
      [
        'be 18 or older, and be the owner of the property, the victim of the crime, or the parent, legal guardian, adult family member, spouse or partner of the missing person;',
        'have reported the crime or the disappearance to SAPS. For a missing person, or for information that leads to an arrest, you must give us the case (CAS) number;',
        `offer between ${min} and ${max}, in rand, and pay it when you post, through our payment provider;`,
        'describe the outcome you want — a recovery, a safe return, or information to SAPS — without naming, describing or picturing anyone you suspect, and without anyone’s ID number, phone number or address;',
        'tell the truth about what happened and what has already been recovered.',
      ],
      `A bounty stays open for the period you choose, up to ${longestDays} days. You can cancel it at any time until someone submits a claim, and we refund the full amount you paid, usually within a few working days. Once a claim is submitted, your bounty stays open until that claim is decided. You can have three bounties open at a time, and we may review a bounty before it is listed.`,
      'A bounty is never conditional on anyone withdrawing a complaint, dropping charges or not talking to the police. You may not promise, in a bounty or anywhere else, that you won’t prosecute.',
    ],
  },
  {
    heading: 'Bounties for missing people',
    blocks: [
      `Missing-person bounties need extra care. We review every one before it is listed, it stays open for at most ${MISSING_PERSON_MAX_DAYS} days, and we may remove it at any time and refund it if we believe it puts someone at risk. Only a parent, legal guardian, adult family member, spouse or partner may post one, and only once SAPS has been told; for a child, only a parent or legal guardian. Say only what SAPS has agreed can be shared. Don’t post a bounty to find someone who has a protection order against you, who has told you they don’t want contact, or who is an adult entitled to leave. If you are the person a bounty describes, or you are acting for them, tell us and we will take it down.`,
      'A bounty for a missing person is a reward for finding them safe and telling SAPS. It is never a payment to whoever is holding them. If someone demands money for a person’s return, that is a crime: contact SAPS immediately.',
    ],
  },
  {
    heading: 'Claiming a bounty',
    blocks: [
      'Anyone 18 or older with a CIVIC/ONE account that is at least three days old can submit a claim, except the poster, anyone involved in the crime, and anyone who bought, received or kept the property knowing or suspecting it was stolen. A claim describes what you did and when, and what you handed to SAPS. The poster and our reviewers see your claim; the public doesn’t. Don’t include anyone’s ID number, phone number or address, and don’t accuse identifiable people — describe what you gave SAPS instead.',
      [
        'For a recovery, the property must be handed to SAPS or returned to the owner through SAPS. Don’t buy it back from whoever has it: receiving stolen property without reasonable cause to believe the seller was entitled to it is an offence, and so is being found with it and unable to explain how you got it.',
        'For a missing person, they must be found safe and SAPS told. Don’t tell us or the poster where the person is; tell SAPS. You can’t claim for a person you were keeping or hiding.',
        'For information, it must have been given to SAPS first, and the claim must say when and at which station. Holding information back until you are paid can be a crime in itself.',
      ],
      'We pay one claim per bounty: the claim the poster confirms and we verify. If more than one person helped, agree between you how to share it before you claim, because we pay only the account on the claim. We don’t pay for a recovery that involved confronting, chasing or detaining anyone.',
    ],
  },
  {
    heading: 'How a bounty is paid out, refunded or disputed',
    blocks: [
      `When a claim comes in, the poster has ${CLAIM_POSTER_RESPONSE_DAYS} days to confirm or decline it. If the poster doesn’t respond, or declines and the claimant asks within ${CLAIM_DISPUTE_DAYS} days, a CIVIC/ONE administrator reviews the claim and may confirm it on the poster’s behalf. After a claim is confirmed, a waiting period runs (three days, or seven for information bounties), and then an administrator verifies the claim — for example against the SAPS case, the property returned and what the claimant says they did. We aim to decide within a few days of the waiting period ending. We may ask either of you for more information, and we may contact SAPS. Our administrators are named members we appoint; they are not police officers.`,
      `If we verify the claim, we pay the full reward to a South African bank account in the claimant’s own name, held with us for at least ${PAYOUT_ACCOUNT_HOLD_HOURS} hours before the payout. We ask for the name on the account and we won’t knowingly pay into anyone else’s account. A reward is usually taxable income for the person who receives it; declaring it is their responsibility.`,
      'We refund the poster in full, to the card or account they paid from, usually within a few working days, when a bounty expires without a verified claim, when the poster cancels before any claim, when we decline to list it, or when every claim has been rejected and the bounty has closed.',
      'An administrator’s decision ends the matter on CIVIC/ONE, and we release or refund the money accordingly. It doesn’t take away any right you have to go to the courts, to a consumer ombud or to SAPS.',
      'We may put a bounty on hold and keep the money for longer while we look into possible fraud, a report that a bounty puts someone at risk, a payment dispute with your bank, a request from SAPS or a court, or where the law requires it. We may reject a claim and refund a bounty, or remove a bounty, where either breaks these terms. If you dispute a bounty payment with your bank, we pause your bounties and may close your account.',
    ],
  },
  {
    heading: 'Fees for bounties',
    blocks: [
      'We don’t charge a fee for bounties at the moment. If we start to, we will show the fee, including VAT, before you pay, it will be charged on top of the reward, and it will be refunded with the reward when a bounty is refunded. Our payment provider charges us processing fees; we don’t pass them on.',
    ],
  },
  {
    heading: 'Bounties before payments are switched on',
    blocks: [
      'Until we announce that bounty payments are on, the Bounties section is visible but nobody can post a bounty or be paid one. These terms apply from the moment payments are switched on.',
    ],
  },
  {
    heading: 'Your content',
    blocks: [
      'You own what you post. So that we can run CIVIC/ONE, you give us a non-exclusive, royalty-free licence to store, display and distribute it on CIVIC/ONE, including to people who aren’t signed in and to search engines. The licence ends when you delete the content or your account, except for copies other people have already shared or that we must keep by law.',
    ],
  },
  {
    heading: 'Removing content and accounts',
    blocks: [
      'We may remove content, limit features, or suspend or close accounts that break these terms or the law, or that put people at risk. We may also keep content and share it with the authorities, as our [privacy policy](/privacy) describes. If we remove a bounty, we refund it unless a verified claim is already being paid.',
    ],
  },
  {
    heading: 'Information on CIVIC/ONE',
    blocks: [
      'Most content is posted by members of the public. We don’t check every post and can’t guarantee that it is accurate, complete or up to date. Use your own judgement, and never act on a post in a way that puts you or anyone else at risk.',
    ],
  },
  {
    heading: 'The service',
    blocks: [
      'CIVIC/ONE is free to use. Bounties are paid for by the members who post them, as the Bounties sections explain. We work to keep CIVIC/ONE available and useful, but we provide it as it is, and we may change, pause or stop features. If we stop bounties, we refund every open bounty.',
    ],
  },
  {
    heading: 'Liability',
    blocks: [
      'As far as the law allows, we are not responsible for loss caused by content other people post, by anything you do based on content you see, or by the service being unavailable. We are not responsible for a bounty not being claimed, for the conduct of posters or claimants, or for what happens when property or people are recovered, except where our own negligence caused the loss. Our responsibility for money held for a bounty is to pay it out or refund it under these terms. Nothing in these terms limits rights you have under the Consumer Protection Act, or under any other law that can’t be excluded.',
    ],
  },
  {
    heading: 'Ending your account',
    blocks: [
      'You can stop using CIVIC/ONE at any time, and delete your account in Settings. Deleting it removes your posts, the replies under them and your conversations straight away, and can’t be undone. If we are holding money for a bounty you posted, or paying out a claim you made, cancel or finish it first: we can’t delete an account while we hold money for it. We keep the record of paid and refunded bounties after you leave, as our [privacy policy](/privacy) describes.',
    ],
  },
  {
    heading: 'Changes to these terms',
    blocks: [
      `We may update these terms. If the changes are significant, we’ll tell you in the app before they take effect. If you keep using CIVIC/ONE after that, you accept the new terms. These terms were last updated on ${LEGAL.updated.terms}.`,
    ],
  },
  {
    heading: 'Law',
    blocks: ['These terms are governed by the laws of South Africa.'],
  },
  {
    heading: 'Contact',
    blocks: [`${LEGAL.operator} · ${contact}`],
  },
]

export default function TermsScreen() {
  return (
    <Screen title="Terms of use" header={<PageHeader title="Terms of use" subtitle={`Updated ${LEGAL.updated.terms}`} back />}>
      <LegalDocument intro={INTRO} sections={SECTIONS} />
    </Screen>
  )
}
