# ADR 0001 — One codebase for web (SSR), iOS, Android, desktop and wearables: Expo SDK 58

- **Status:** Accepted (October 2026)

## Requirements

Server-side rendering for SEO, *and* native apps for Android, Apple platforms, desktop and wearables, all from one core TypeScript codebase.

## Options

| Option | Web SSR | iOS / Android | Desktop | Wearables | Verdict |
| --- | --- | --- | --- | --- | --- |
| **Expo SDK 58 + Expo Router** | **Stable** streaming SSR, `generateMetadata`, data loaders (since SDK 58) | Native (React Native 0.88) | Web build in an Electron shell, or React Native macOS/Windows | Wear OS runs the Android app; watchOS needs a SwiftUI target (any stack) | ✅ Chosen |
| Next.js + Solito + Expo | Most mature SSR | Native via a second app shell | Same as above | Same | Two routers and two app shells to keep in sync |
| One (Tamagui, Vite) | SSR/SSG/SPA | Native | Same | Same | Promising, but younger and with a smaller ecosystem |
| Flutter | **Canvas web, poor SEO**, not TypeScript | Native | Native | Wear OS | Fails the SEO and TypeScript requirements |

Expo Router reached **stable server rendering in SDK 58** (it was `unstable_useServerRendering` in SDK 55–57). The same route files render on the server for the web and natively on devices.

## How it is wired

- `web.output: "server"` produces `dist/client` (hashed static bundles) and `dist/server` (render + loader bundles). An AWS Lambda streams the HTML (`apps/app/server/lambda.ts`).
- Route `loader`s prefetch GraphQL **on the server**. Their payload is fed into urql's SSR cache before the first render (`src/lib/graphql/hydrate.web.ts`), so crawlers and link previews see real posts and the browser hydrates without refetching. Native screens fetch on mount (no loaders).
- `generateMetadata` provides titles, descriptions, canonical URLs, Open Graph and Twitter cards per route; post pages also emit `SocialMediaPosting` JSON-LD.
- **Theme without a flash:** on web every colour is a CSS variable switched by `prefers-color-scheme`, so server HTML is right in light and dark mode. Native reads the concrete palette.
- **Responsive without a flash:** on web the three-column ↔ icon-rail ↔ tab-bar breakpoints are CSS media queries on `data-*` attributes, because the server can't know the viewport. Native picks a layout from the window size.
- Platform splits use file extensions (`PostList.web.tsx`, `storage.web.ts`, `use-colors.web.ts`), never runtime `if (web)` forks inside components.

## Platform matrix

| Platform | How | Status in this repo |
| --- | --- | --- |
| Web (SSR) | Expo Router server output → Lambda + CloudFront | ✅ Built, rendered and verified locally; deployed by CDK |
| iOS / iPadOS | `eas build` (`.github/workflows/mobile.yml`, `apps/app/eas.json`) | ⚙️ Configured; needs an Expo account + Apple credentials |
| Android | `eas build` | ⚙️ Configured; needs an Expo account |
| macOS / Windows / Linux | Electron shell around the deployed SSR site (`apps/desktop`) with deep links, menus and a sandboxed renderer | ⚙️ Built and typechecked; packaged by `.github/workflows/desktop.yml` |
| Wear OS | The Android build installs on Wear OS; a dedicated round-screen "Alerts near you" route is the next step | 🗺️ Planned |
| watchOS | **No JavaScript framework compiles to watchOS UI.** Plan: a small SwiftUI watch target added with `@bacons/apple-targets`, reading the same GraphQL API (persisted operation for alerts) and sharing the session via App Groups | 🗺️ Planned — the one place that cannot be TypeScript |

## Consequences

- One component tree, one GraphQL contract and one design system across platforms.
- The client JS bundle is heavy today (~1 MB per shared chunk). Code-splitting and tree-shaking passes are tracked as follow-ups.
- Wearables need small native glue (SwiftUI on watchOS). That is a property of the platform, not of Expo.

## Sources

- [Expo Router server rendering](https://docs.expo.dev/router/web/server-rendering/) · [Data loaders](https://docs.expo.dev/router/web/data-loaders/) · [Expo Router v56 blog](https://expo.dev/blog/expo-router-v56-decoupling-from-react-navigation)
- [Expo SDK 58 upgrade guide](https://expo.dev/blog/how-to-upgrade-to-sdk-58) · [Expo apple targets — watch apps](https://www.mintlify.com/EvanBacon/expo-apple-targets/guides/watch-apps)
