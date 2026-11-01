import { Link } from 'expo-router'
import * as Linking from 'expo-linking'
import { Fragment } from 'react'
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { fonts, useColors } from '@/theme'
import { textStyles, Txt } from './ui'

/** A paragraph, or a bulleted list when it's an array. `[label](href)` makes a link. */
export type LegalBlock = string | string[]

export interface LegalSection {
  heading: string
  blocks: LegalBlock[]
}

const LINK = /\[([^\]]+)\]\(([^)]+)\)/g

function Inline({ text }: { text: string }) {
  const c = useColors()
  const linkStyle = { color: c.accentText, fontFamily: fonts.semibold }
  const parts: Array<string | { label: string; href: string }> = []
  let last = 0
  for (const match of text.matchAll(LINK)) {
    const [whole, label = '', href = ''] = match
    parts.push(text.slice(last, match.index), { label, href })
    last = match.index + whole.length
  }
  parts.push(text.slice(last))
  return parts.map((part, index) => {
    if (typeof part === 'string') return <Fragment key={index}>{part}</Fragment>
    if (part.href.startsWith('/')) {
      return (
        <Link key={index} href={part.href as never} style={linkStyle}>
          {part.label}
        </Link>
      )
    }
    return Platform.OS === 'web' ? (
      <Text key={index} style={linkStyle} href={part.href} hrefAttrs={part.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : undefined} role="link">
        {part.label}
      </Text>
    ) : (
      <Text key={index} style={linkStyle} onPress={() => void Linking.openURL(part.href)} accessibilityRole="link">
        {part.label}
      </Text>
    )
  })
}

/** Long-form policy text (privacy policy, terms) in the main column. */
export function LegalDocument({ intro, sections }: { intro: string; sections: LegalSection[] }) {
  const c = useColors()
  const Body = Platform.OS === 'web' ? View : ScrollView
  const paragraph = [textStyles.body, { color: c.text }]
  return (
    <Body>
      <View style={styles.document}>
        <Text style={paragraph}>
          <Inline text={intro} />
        </Text>
        {sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Txt variant="title" accessibilityRole="header">
              {section.heading}
            </Txt>
            {section.blocks.map((block, index) =>
              typeof block === 'string' ? (
                <Text key={index} style={paragraph}>
                  <Inline text={block} />
                </Text>
              ) : (
                <View key={index} style={styles.list}>
                  {block.map((item) => (
                    <View key={item} style={styles.item}>
                      <Text style={[paragraph, { color: c.textMuted }]} aria-hidden>
                        •
                      </Text>
                      <Text style={[paragraph, styles.itemText]}>
                        <Inline text={item} />
                      </Text>
                    </View>
                  ))}
                </View>
              ),
            )}
          </View>
        ))}
      </View>
    </Body>
  )
}

const styles = StyleSheet.create({
  document: { gap: 22, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 48 },
  section: { gap: 10 },
  list: { gap: 6 },
  item: { flexDirection: 'row', gap: 10 },
  itemText: { flex: 1 },
})
