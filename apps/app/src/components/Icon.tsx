import type { ReactNode } from 'react'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

// Line icon set from the original design, extended for the new features.
const paths = {
  arrowLeft: <Path d="M19 12H5M11 6l-6 6 6 6" />,
  arrowRight: <Path d="M5 12h14M13 6l6 6-6 6" />,
  bell: <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
  bookmark: <Path d="M6 3h12v18l-6-4-6 4z" />,
  check: <Path d="m7 12 3 3 7-7" />,
  close: <Path d="m6 6 12 12M18 6 6 18" />,
  comment: <Path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />,
  dots: (
    <>
      <Circle cx="5" cy="12" r="1" fill="currentColor" />
      <Circle cx="12" cy="12" r="1" fill="currentColor" />
      <Circle cx="19" cy="12" r="1" fill="currentColor" />
    </>
  ),
  globe: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  heart: <Path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z" />,
  home: (
    <>
      <Path d="m3 11 9-8 9 8" />
      <Path d="M5 10v11h14V10M9 21v-7h6v7" />
    </>
  ),
  image: (
    <>
      <Rect x="3" y="4" width="18" height="16" rx="2" />
      <Circle cx="8.5" cy="9" r="1.5" />
      <Path d="m21 15-5-5L5 20" />
    </>
  ),
  location: (
    <>
      <Path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z" />
      <Circle cx="12" cy="10" r="2.5" />
    </>
  ),
  lock: (
    <>
      <Rect x="5" y="11" width="14" height="10" rx="2" />
      <Path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  logout: <Path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11" />,
  map: <Path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15" />,
  more: (
    <>
      <Circle cx="12" cy="5" r="1" fill="currentColor" />
      <Circle cx="12" cy="12" r="1" fill="currentColor" />
      <Circle cx="12" cy="19" r="1" fill="currentColor" />
    </>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
  profile: (
    <>
      <Circle cx="12" cy="8" r="4" />
      <Path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  radar: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Circle cx="12" cy="12" r="5" />
      <Path d="M12 12 18.5 5.5" />
      <Circle cx="12" cy="12" r="1" fill="currentColor" />
    </>
  ),
  repost: <Path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />,
  search: (
    <>
      <Circle cx="11" cy="11" r="7" />
      <Path d="m20 20-4-4" />
    </>
  ),
  send: <Path d="m22 2-7 20-4-9-9-4zM22 2 11 13" />,
  settings: (
    <>
      <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <Circle cx="12" cy="12" r="3" />
    </>
  ),
  share: (
    <>
      <Path d="M12 3v12M7 8l5-5 5 5" />
      <Path d="M5 13v8h14v-8" />
    </>
  ),
  shield: <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  siren: <Path d="M7 18v-6a5 5 0 0 1 10 0v6M5 21h14v-3H5zM12 3v1M4.2 6.2l.7.7M19.8 6.2l-.7.7M2 12h1M21 12h1" />,
  trash: <Path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" />,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof paths

export function Icon({ name, size = 21, color, filled = false }: { name: IconName; size?: number; color: string; filled?: boolean }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      color={color}
      aria-hidden
    >
      {paths[name]}
    </Svg>
  )
}
