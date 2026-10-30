import { segmentBody } from '@civic/core'
import { Link } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { Platform, type StyleProp, Text, type TextStyle } from 'react-native'
import { fonts, useColors } from '@/theme'
import { textStyles } from './ui'

/** Renders hashtags, mentions and links consistently on every platform (shared tokenizer in @civic/core). */
export function RichText({ body, style, numberOfLines }: { body: string; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const c = useColors()
  const linkStyle = { color: c.accentText, fontFamily: fonts.semibold }
  return (
    <Text style={[textStyles.body, { color: c.text }, style]} numberOfLines={numberOfLines}>
      {segmentBody(body).map((segment, index) => {
        switch (segment.type) {
          case 'hashtag':
            return (
              <Link key={index} href={`/topic/${segment.slug}`} style={linkStyle}>
                {segment.text}
              </Link>
            )
          case 'mention':
            return (
              <Link key={index} href={`/u/${segment.handle}`} style={linkStyle}>
                {segment.text}
              </Link>
            )
          case 'link':
            return Platform.OS === 'web' ? (
              <Text key={index} style={linkStyle} href={segment.url} hrefAttrs={{ target: '_blank', rel: 'noopener noreferrer nofollow' }} role="link">
                {segment.text.replace(/^https?:\/\//, '')}
              </Text>
            ) : (
              <Text key={index} style={linkStyle} onPress={() => WebBrowser.openBrowserAsync(segment.url)} accessibilityRole="link">
                {segment.text.replace(/^https?:\/\//, '')}
              </Text>
            )
          default:
            return segment.text
        }
      })}
    </Text>
  )
}

declare module 'react-native' {
  interface TextProps {
    /** React Native Web: render as an anchor. */
    href?: string
    hrefAttrs?: { target?: string; rel?: string; download?: boolean }
  }
}
