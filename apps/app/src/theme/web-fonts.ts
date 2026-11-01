import { webFontFiles } from './font-assets.web'
import type { FontFamily } from './fonts'

/** Keep in step with UNICODES in scripts/subset-fonts.sh. */
const LATIN =
  'U+0000-00FF,U+0100-017F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FEFF,U+FFFD'

/** Body text and names make up most of the first screen; the other faces swap in when used. */
const PRELOAD: FontFamily[] = ['DMSans_400Regular', 'DMSans_700Bold']

// `swap` paints text in the fallback stack at once instead of hiding it for up
// to 3s. Characters outside the subset fall back to the system font.
export const webFontCss = Object.entries(webFontFiles)
  .map(([family, src]) => `@font-face{font-family:"${family}";src:url("${src}") format("woff2");font-display:swap;unicode-range:${LATIN}}`)
  .join('')

export const webFontPreloads = PRELOAD.map((family) => webFontFiles[family])
