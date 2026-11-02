import { PREVIEW_PAGES, previewPageImage } from '@civic/core'
import { LegalDocument, type LegalSection } from '@/components/LegalDocument'
import { PageHeader, Screen } from '@/components/Screen'
import { LEGAL } from '@/lib/legal'
import { pageMetadata } from '@/lib/seo'

export function generateMetadata() {
  return pageMetadata({ title: 'Terms of use', description: PREVIEW_PAGES.terms.description, path: '/terms', image: previewPageImage('terms') })
}

const contact = `[${LEGAL.email}](mailto:${LEGAL.email})`

const INTRO = `These terms are the agreement between you and ${LEGAL.operator} for using CIVIC/ONE on the web and in our apps. By signing in, you accept them. Please also read our [privacy policy](/privacy).`

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
    heading: 'Your content',
    blocks: [
      'You own what you post. So that we can run CIVIC/ONE, you give us a non-exclusive, royalty-free licence to store, display and distribute it on CIVIC/ONE, including to people who aren’t signed in and to search engines. The licence ends when you delete the content or your account, except for copies other people have already shared or that we must keep by law.',
    ],
  },
  {
    heading: 'Removing content and accounts',
    blocks: [
      'We may remove content, limit features, or suspend or close accounts that break these terms or the law, or that put people at risk. We may also keep content and share it with the authorities, as our [privacy policy](/privacy) describes.',
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
    blocks: ['CIVIC/ONE is free to use. We work to keep it available and useful, but we provide it as it is, and we may change, pause or stop features.'],
  },
  {
    heading: 'Liability',
    blocks: [
      'As far as the law allows, we are not responsible for loss caused by content other people post, by anything you do based on content you see, or by the service being unavailable. Nothing in these terms limits rights you have under the Consumer Protection Act, or under any other law that can’t be excluded.',
    ],
  },
  {
    heading: 'Ending your account',
    blocks: [
      'You can stop using CIVIC/ONE at any time, and delete your account in Settings. Deleting it removes your posts, the replies under them and your conversations straight away, and can’t be undone.',
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
