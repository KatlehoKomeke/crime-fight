import { useServerDocumentContext } from 'expo-router/html'
import type { PropsWithChildren } from 'react'
import { serverConfig } from '@/lib/config'
import { globalCss } from '@/theme/css'

/** `</script>`-safe JSON for inline scripts. */
const inlineJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')

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
        <style id="civic-global" dangerouslySetInnerHTML={{ __html: globalCss }} />
        <script dangerouslySetInnerHTML={{ __html: `window.__CIVIC_CONFIG__=${inlineJson(serverConfig())}` }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  )
}
