import { useServerDocumentContext } from 'expo-router/html'
import { isValidElement, type PropsWithChildren, type ReactNode } from 'react'
import { serverConfig } from '@/lib/config'
import { globalCss } from '@/theme/css'
import { webFontCss, webFontPreloads } from '@/theme/web-fonts'

/** `</script>`-safe JSON for inline scripts. */
const inlineJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')

/**
 * Expo preloads every script chunk, which fetches ~1MB of JavaScript at high
 * priority. On a phone that delays first paint while it competes with the HTML and
 * fonts. The page is fully server-rendered, so the deferred <script> tags
 * can start at their normal priority instead.
 */
const isScriptPreload = (node: ReactNode) =>
  isValidElement<{ rel?: string; as?: string }>(node) && node.type === 'link' && node.props.rel === 'preload' && node.props.as === 'script'

/**
 * The HTML document for every server-rendered page (web only). Runs on the
 * server per request, so public runtime config comes from the SSR Lambda's
 * environment and one build can be promoted from QA to prod.
 */
export default function Root({ children }: PropsWithChildren) {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext()
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f7f7f2" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b0c0a" />
        <meta name="color-scheme" content="light dark" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        {/* PNGs for link previews and home screens that can't use SVG (iMessage, WhatsApp, Slack). */}
        <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {webFontPreloads.map((href) => (
          <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="" />
        ))}
        <style id="civic-fonts" dangerouslySetInnerHTML={{ __html: webFontCss }} />
        <style id="civic-global" dangerouslySetInnerHTML={{ __html: globalCss }} />
        <script dangerouslySetInnerHTML={{ __html: `window.__CIVIC_CONFIG__=${inlineJson(serverConfig())}` }} />
        {(Array.isArray(headNodes) ? headNodes : [headNodes]).filter((node) => !isScriptPreload(node))}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  )
}
