import { Link, type LinkProps } from 'expo-router'
import { type ReactNode, useState } from 'react'
import { Pressable, type PressableProps, type StyleProp, StyleSheet, type ViewStyle } from 'react-native'

/**
 * A pressable navigation row that renders a real `<a href>` on web (crawlable,
 * middle-clickable) with hover feedback.
 *
 * `<Link asChild>` merges props via Radix Slot, which spreads `style` as an
 * object — so a child's style *function* or style *array* is silently lost.
 * We track hover ourselves and hand Link a single flattened style object.
 */
export function HoverLink({
  href,
  style,
  hoverStyle,
  children,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  href: LinkProps['href']
  style?: StyleProp<ViewStyle>
  hoverStyle?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <Link href={href} asChild>
      <Pressable {...rest} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} style={StyleSheet.flatten([style, hovered && hoverStyle])}>
        {children}
      </Pressable>
    </Link>
  )
}
