import { dark, light, type Palette } from './palette'

const declarations = (palette: Palette) =>
  Object.entries(palette)
    .map(([name, value]) => `--c-${name}:${value};`)
    .join('')

/**
 * Global web stylesheet, inlined by +html.tsx.
 *  - Colour tokens as CSS variables (light/dark via media query).
 *  - Responsive shell rules: React Native Web cannot express media queries, and
 *    the server does not know the viewport, so layout breakpoints live in CSS
 *    keyed off `data-*` attributes rendered by the shell.
 */
export const globalCss = `
:root{${declarations(light)}color-scheme:light}
@media (prefers-color-scheme: dark){:root{${declarations(dark)}color-scheme:dark}}
html,body{background:var(--c-bg);margin:0;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
body{overflow-y:scroll}
#root{display:flex;flex-direction:column;min-height:100vh}
:focus-visible:not(input):not(textarea){outline:2px solid var(--c-focus)!important;outline-offset:2px}
input:focus,textarea:focus{outline:none}
::selection{background:var(--c-accent);color:#10110f}
textarea,input{caret-color:var(--c-text)}

[data-shell="left"]{display:flex!important}
[data-shell="right"]{display:flex!important}
[data-shell="bottom"]{display:none!important}
[data-shell="fab"]{display:none!important}

@media (max-width:1279px){
  [data-shell-label]{display:none!important}
  [data-shell="left"]{width:88px!important}
  [data-rail-inner]{padding-left:13px!important;padding-right:13px!important;align-items:center!important}
  [data-rail-item]{align-self:center!important;padding-left:13px!important;padding-right:13px!important;justify-content:center!important}
  [data-shell-compact]{display:flex!important}
  [data-shell-wide]{display:none!important}
}
@media (min-width:1280px){[data-shell-compact]{display:none!important}}
@media (max-width:1079px){[data-shell="right"]{display:none!important}}
@media (max-width:759px){
  [data-shell="left"]{display:none!important}
  [data-shell="bottom"]{display:flex!important}
  [data-shell="fab"]{display:flex!important}
  [data-hide-mobile]{display:none!important}
  [data-mobile-only]{display:flex!important}
}
@media (min-width:760px){[data-mobile-only]{display:none!important}}

@keyframes civic-pulse{0%{box-shadow:0 0 0 0 rgba(244,81,62,.45)}70%{box-shadow:0 0 0 8px rgba(244,81,62,0)}100%{box-shadow:0 0 0 0 rgba(244,81,62,0)}}
[data-pulse]{animation:civic-pulse 2s infinite}
@keyframes civic-shimmer{0%{opacity:.55}50%{opacity:1}100%{opacity:.55}}
[data-skeleton]{animation:civic-shimmer 1.4s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
`
