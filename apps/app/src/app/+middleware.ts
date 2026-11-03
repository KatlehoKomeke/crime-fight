import type { MiddlewareFunction } from 'expo-router/server'
import type { MiddlewareSettings } from 'expo-server'

const ALERTS = /^\/alerts\/?$/
const RADAR = /^\/map\/?$/
const OLD_PROFILE = /^\/u\/([^/]+)\/?$/

/**
 * Permanent redirects from old URLs, so links and search results keep working.
 * They can't be API routes: the server tries page routes first, and the
 * profile route at the root (`/[handle]`) would answer `/alerts` itself.
 * Not the expo-router `redirects` option either: that sends `/(main)/…`.
 */
const middleware: MiddlewareFunction = (request) => {
  const { pathname, search } = new URL(request.url)
  const profile = OLD_PROFILE.exec(pathname)
  // Alerts became part of Notifications; Live radar was retired; profiles moved from /u/handle to /@handle.
  const location = ALERTS.test(pathname) ? '/notifications' : RADAR.test(pathname) ? '/' : profile ? `/@${profile[1]}` : null
  // Relative, so it stays on whichever host CloudFront was asked for.
  if (location) return new Response(null, { status: 301, headers: { Location: `${location}${search}` } })
}

export default middleware

export const unstable_settings: MiddlewareSettings = {
  matcher: { methods: ['GET', 'HEAD'], patterns: [ALERTS, RADAR, OLD_PROFILE] },
}
