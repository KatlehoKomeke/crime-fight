import { PREVIEW_PAGES, previewPageImage } from '@civic/core'
import { LegalDocument, type LegalSection } from '@/components/LegalDocument'
import { PageHeader, Screen } from '@/components/Screen'
import { LEGAL } from '@/lib/legal'
import { pageMetadata } from '@/lib/seo'

export function generateMetadata() {
  return pageMetadata({ title: 'Privacy policy', description: PREVIEW_PAGES.privacy.description, path: '/privacy', image: previewPageImage('privacy') })
}

const contact = `[${LEGAL.email}](mailto:${LEGAL.email})`

const INTRO =
  'CIVIC/ONE helps neighbours share verified local safety updates. This policy explains what personal information we collect, why we collect it, who can see it and the choices you have. It is written to meet South Africa’s Protection of Personal Information Act (POPIA) and Google’s requirements for apps that offer Google sign-in.'

const SECTIONS: LegalSection[] = [
  {
    heading: 'Who we are',
    blocks: [`CIVIC/ONE is run by ${LEGAL.operator} (“we”, “us”), the responsible party for your personal information under POPIA. Send questions, requests and complaints to ${contact}.`],
  },
  {
    heading: 'What we collect',
    blocks: [
      [
        'When you sign in: you sign in with Google or Apple, which send us your name, your email address, whether that address is verified, and an account identifier. We never see your password. If you use Apple’s Hide My Email, we receive the relay address instead.',
        'Your profile: your handle, display name and bio. Your Google or Apple name fills in your display name once; you can change it in Settings.',
        'Your posts and replies, including any area or category they name. We don’t ask for or store your device’s location.',
        'Your activity: who you follow, and the posts you like, repost or save.',
        'Messages you send to other members.',
        'Bounties you post: the amount, your description, the SAPS case number, who you are to a missing person, how long the bounty is open, and the payment reference our payment provider gives us. Your card or bank details go straight to the payment provider; we never see them.',
        'Claims you make: what you write, the SAPS station and reference you give, and any decision on the claim.',
        'Payout details, if you are paid a bounty: your bank’s name, the name you give for the account, the last four digits of the account number, and the reference our payment provider gives us. The provider holds the full account number.',
        'Technical information: our servers log each request (the time, the page or operation, the result and how long it took) so we can keep the service running and secure. Our hosting provider processes your IP address to deliver traffic and block abuse.',
      ],
      'We don’t use advertising or analytics trackers, and we don’t set cookies. To keep you signed in, your device stores a sign-in token: in secure storage on phones, and in your browser’s local storage on the web.',
    ],
  },
  {
    heading: 'How we use it',
    blocks: [
      [
        'To run your account and show your profile, posts and messages.',
        'To show updates and alerts from verified sources.',
        'To keep CIVIC/ONE safe: preventing spam, abuse and impersonation, and investigating reports.',
        'To hold, pay out and refund bounty money, to verify claims, and to detect fraud and misuse of bounties.',
        'To fix problems and improve the service.',
        'To meet our legal obligations.',
      ],
      'We process your information to provide the service you signed up for, for our legitimate interest in keeping it safe, and where the law requires it. We don’t sell personal information, use it for advertising, or make automated decisions about you that have legal effects. Verifying a claim can involve information about a crime and about people alleged to have committed it. We process it only to decide whether the bounty is due, we keep it out of public view, and we may share it with SAPS as described below.',
    ],
  },
  {
    heading: 'Who can see what',
    blocks: [
      [
        'Everyone: your handle, display name, bio, posts, replies, who you follow and who follows you. This includes people who aren’t signed in, and search engines.',
        'Everyone: the bounties you post — the amount, the description, the status and your profile — including people who aren’t signed in and search engines. The SAPS case number on a missing-person bounty is public, so that anyone who sees the person can give it to SAPS; on other bounties it is shown only to signed-in members.',
        'The poster, the claimant and CIVIC/ONE’s administrators: a claim and what it says. Administrators are a small number of named members we appoint to verify claims.',
        'Only you: your email address and your saved posts.',
        'Only you and our administrators: your payout details and payment references.',
        'The people in a conversation: its messages. Only members who follow each other can message. Both keep the history, unless one of them deletes their account, which deletes the conversation for both.',
      ],
      'Messages are encrypted in transit and on our servers, but they are not end-to-end encrypted. We access them only when we need to run the service, investigate abuse or comply with the law.',
    ],
  },
  {
    heading: 'Who we share it with',
    blocks: [
      [
        'Amazon Web Services (AWS) hosts CIVIC/ONE. Your account, posts and messages are stored in AWS’s Cape Town region in South Africa. Pages and data are delivered through AWS’s global network, so requests can pass through servers outside South Africa.',
        'Paystack, our payment provider, when you pay for a bounty or are paid one. Paystack receives your name, email address, the amount and, for payouts, your bank details, and processes them under its own privacy policy. Paystack is part of Stripe, so some processing can happen outside South Africa; it may only use your information to provide the payment service to us.',
        'Google and Apple, when you choose to sign in with them. Their own privacy policies cover your account with them.',
        'Authorities, when the law requires it, when we believe it is necessary to prevent serious harm to someone, or when a bounty or claim concerns a SAPS case and SAPS asks us about it.',
      ],
      'Our service providers may only use your information to provide their service to us, and must protect it.',
    ],
  },
  {
    heading: 'Google user data',
    blocks: [
      'If you sign in with Google, we receive only your basic profile: your name, email address, whether it is verified, and your Google account identifier (the “openid”, “email” and “profile” scopes). We use it only to create your CIVIC/ONE account, sign you in, fill in your display name and recognise you if you contact us. We don’t sell it, use it for advertising, or share it except as this policy describes. We don’t ask for access to your Gmail, contacts, files or any other Google data.',
      'CIVIC/ONE’s use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.',
    ],
  },
  {
    heading: 'How long we keep it',
    blocks: [
      [
        'Your account information: for as long as you have an account.',
        'Posts you delete: they disappear from CIVIC/ONE straight away. We keep a hidden record until your account is deleted, so we can investigate reports of abuse.',
        'Bounties, claims, decisions and payment records: five years after the bounty closes. Payment regulation and tax law require us to keep records of money we have held and paid out.',
        'The description on a missing-person bounty: removed seven days after the bounty closes. The text of a claim: removed one year after the bounty closes, unless a dispute, a SAPS request or a legal duty means we must keep it.',
        'Payout bank details: until you replace them in Settings or ask us to remove them, and in any case not after your last payout is five years old.',
        'Server logs: 30 days.',
        'Backups: up to 14 days.',
      ],
      'When you delete your account in Settings, we immediately delete your profile, your posts and the replies under them, your likes, reposts, saves and follows, your conversations, and your sign-in record with our login provider. Copies leave our backups within 14 days. We keep the record of bounties you paid for or were paid — the amounts, dates, decisions and payment references, without your profile — for five years, because the law requires it, and we keep anything else only if the law requires it.',
    ],
  },
  {
    heading: 'Your rights',
    blocks: [
      'Under POPIA you can ask us to:',
      [
        'give you a copy of the personal information we hold about you;',
        'correct it;',
        'delete it, or your whole account;',
        'stop processing it, if you have grounds to object.',
      ],
      `You can edit your profile, or delete your account, in Settings at any time. For anything else, email ${contact} from the address you sign in with. We’ll respond within 30 days. If a missing-person bounty describes you, or someone you act for, tell us and we will remove it. If you’re unhappy with how we handle your information, you can complain to the [Information Regulator](https://inforegulator.org.za).`,
    ],
  },
  {
    heading: 'Security',
    blocks: [
      'Every connection uses HTTPS, stored data is encrypted, and only the people who run CIVIC/ONE can reach its production systems. No system is perfectly secure. If a breach affects your information, we’ll tell you and the Information Regulator, as POPIA requires. Bounty money is held with our payment provider until it is paid out or refunded.',
    ],
  },
  {
    heading: 'Children',
    blocks: [
      'CIVIC/ONE is for people aged 18 and over. If you believe a child has created an account, tell us and we’ll delete it. A missing-person bounty may describe a child. Only the child’s parent or legal guardian may post it, and we rely on their consent to show the child’s name and description for as long as the bounty is open. We remove it when the child is found, when the bounty closes, or when a parent, guardian or SAPS asks us to.',
    ],
  },
  {
    heading: 'Changes to this policy',
    blocks: [`If we make significant changes, we’ll tell you in the app before they take effect. This policy was last updated on ${LEGAL.updated.privacy}.`],
  },
  {
    heading: 'Contact',
    blocks: [`${LEGAL.operator} · ${contact}. Also see our [terms of use](/terms).`],
  },
]

export default function PrivacyScreen() {
  return (
    <Screen title="Privacy policy" header={<PageHeader title="Privacy policy" subtitle={`Updated ${LEGAL.updated.privacy}`} back />}>
      <LegalDocument intro={INTRO} sections={SECTIONS} />
    </Screen>
  )
}
