# ADR 0003 — GraphQL API: Yoga + Pothos, persisted operations, DataLoader

- **Status:** Accepted (October 2026)

## Goal

"Use GraphQL to avoid useless API calls": each screen fetches exactly what it renders, in one request, and the system never wastes a round trip it can avoid.

## Decisions

| Concern | Decision | Effect |
| --- | --- | --- |
| Server | **GraphQL Yoga 6** on Lambda (behind API Gateway HTTP API, reached through CloudFront at `/graphql`) | Fetch-API based; the same `createApi()` runs in Lambda, the local dev server and the tests. |
| Schema | **Pothos 4**, code-first, non-null by default | The schema is typed from the TypeScript model; `schema.graphql` is printed and committed as the contract. |
| Client types | **graphql-codegen client preset** in `packages/graphql` | Every operation in `apps/app/src/graphql/documents.ts` is a typed document; wrong fields fail `tsc`. |
| Over-fetching | Fragments per component (`PostCardFields`, `UserRowFields`) | Screens request exactly what they render. |
| Under-fetching / round trips | One query per screen; the page *and* its nested data (authors, media, topics, viewer state) come back together | One request per screen. |
| N+1 on the server | **Request-scoped DataLoaders** | A 20-post feed with authors, media, topics and like state is **≤ 6 SQL statements** regardless of page size (asserted in `apps/api/test/api.test.ts`). |
| Refetching | **Normalised client cache** (urql Graphcache) with relay pagination and **optimistic updates** | Like a post in the feed and it's liked on the detail page and the profile instantly, with no refetch. |
| Duplicate SSR fetches | Route loaders prefetch on the server; the client restores that payload | The page is never fetched twice on first load. |
| Request size and security | **Persisted operations**: clients send a sha256 hash, not the query text. Prod (`PERSISTED_ONLY=true`) rejects anything not generated from the app's source | Smaller requests; arbitrary or expensive queries can't be sent to prod at all (no depth/cost-limit arms race). |
| Pagination | Relay connections over a **keyset** on `(created_at, id)`; forward-only, max 50 per page | Stable under concurrent inserts; no OFFSET scans. Backward args are rejected rather than silently ignored. |
| Errors | Typed codes (`UNAUTHENTICATED`, `FORBIDDEN`, `BAD_USER_INPUT`, `NOT_FOUND`); everything else masked in deployed stages | An expired token returns HTTP 401, so the client refreshes instead of silently browsing logged out. |
| Auth | Cognito ID token verified with `aws-jwt-verify` (JWKS cached per container); a user row is provisioned on first sign-in | No extra post-confirmation Lambda. `AUTH_MODE=dev` (header `x-dev-user`) is refused in qa/prod. |
| Domain rules | Shared `@civic/core` package: privacy guard, validation, trust badges | The composer flags personal data as you type (no network call); the API re-runs the same rules authoritatively. |

## Trust and safety built into the API

- **Trust badges are derived** from verified roles (`OFFICIAL_SOURCE`, `VERIFIED_UPDATE`, …) and cannot be typed into a post.
- **Only verified officials/newsrooms** can publish `ALERT`/`ADVISORY` posts.
- **Location coarsening:** member post locations are rounded to about 1 km server-side; only officials publish exact incident locations.
- **Privacy guard:** Luhn-checked ID numbers and card numbers *block* publishing; phone numbers, emails and exact street addresses *warn*.

## Follow-ups

- Real-time alerts (GraphQL subscriptions over AppSync Events or API Gateway WebSockets).
- Edge caching of anonymous persisted GET queries (needs auth-aware cache keys).
- Image uploads (S3 presigned POST + moderation) and a moderation queue for reports.
