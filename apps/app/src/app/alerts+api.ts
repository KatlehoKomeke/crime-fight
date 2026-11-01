/**
 * Alerts became part of Notifications; old links and search results land there.
 * Not the expo-router `redirects` option: that sends `/(main)/notifications`.
 */
export function GET(request: Request) {
  // Relative, so it stays on whichever host CloudFront was asked for.
  return new Response(null, { status: 301, headers: { Location: `/notifications${new URL(request.url).search}` } })
}

export const HEAD = GET
