import { type Palette, light } from './palette'

/**
 * Web: every colour is a CSS custom property, resolved by the browser via
 * `prefers-color-scheme` (see theme/css.ts). Server-rendered HTML is therefore
 * correct in both themes on first paint — no flash, no hydration mismatch.
 */
const vars = Object.fromEntries(Object.keys(light).map((name) => [name, `var(--c-${name})`])) as unknown as Palette

export function useColors(): Palette {
  return vars
}
