# CIVIC/ONE

Verified local safety updates, official alerts, victim support and the people keeping a neighbourhood informed. A ground-up rebuild of the Figma Make "twitter-clone" prototype as a real product. TypeScript end to end:

| Layer | Stack |
| --- | --- |
| **App** (web SSR · iOS · Android · desktop) | Expo SDK 58, Expo Router (streaming SSR, loaders, metadata), React Native 0.88, urql + Graphcache |
| **API** | GraphQL Yoga 6 + Pothos 4 (code-first), DataLoader, persisted operations, Cognito JWT auth |
| **Data** | Aurora PostgreSQL 17 Serverless v2 + PostGIS, Drizzle ORM, RDS Data API |
| **Infra** | AWS CDK: CloudFront, Lambda (SSR + API), API Gateway, Aurora, Cognito, S3 |
| **Delivery** | GitHub Actions: CI on every PR; every push to `main` deploys **QA**, smoke-tests it, then promotes to **prod** |

Why these choices: [ADR 0001 universal app](docs/adr/0001-universal-app.md) · [ADR 0002 database research](docs/adr/0002-database.md) · [ADR 0003 GraphQL API](docs/adr/0003-graphql-api.md) · [ADR 0004 AWS delivery](docs/adr/0004-aws-delivery.md)

## What's better than the prototype

The prototype was one 289-line component with hard-coded posts. This version keeps its look (ink / paper / lime / coral, DM Sans + Space Grotesk, three-column layout) and makes it real:

- **Server-rendered, crawlable pages:** real posts in the HTML, per-page titles and Open Graph, canonical URLs and JSON-LD. Dark mode and responsive layout are correct on first paint (CSS variables and media queries, no flash).
- **Feeds that work:** For you · Nearby (PostGIS radius) · Following, infinite scroll, threaded replies, topics from `#hashtags`, people and post search, saved posts and profiles.
- **Trust you can't fake:** "Verified update / Official source" badges come from verified roles, not post text. Only verified officials and newsrooms can publish alerts.
- **Privacy by default:** the composer flags ID numbers, card numbers, phone numbers, emails and street addresses *as you type* (no network call) and blocks the dangerous ones. The API re-checks with the same code. Member locations are coarsened to about 1 km.
- **Live radar:** nearby updates plotted by distance and severity (replaces the static "Live map" link).
- **Instant interactions:** optimistic likes, reposts, saves and follows over a normalised cache, so one change updates every screen.
- **Accessible:** semantic roles, labels, live-region toasts, reduced-motion support, visible focus rings, and body text at 15px instead of 8–9px.

## Repository layout

```
apps/
  app/        Expo universal app — src/app (routes), src/components, src/lib, server/lambda.ts (SSR handler)
  api/        GraphQL API — src/schema (Pothos), src/data (SQL + DataLoaders), src/handlers (Lambda), test/
  desktop/    Electron shell (macOS · Windows · Linux)
packages/
  core/       Shared domain rules: privacy guard, validation, trust badges, formatting, geo
  db/         Drizzle schema, SQL migrations, seed data, client factory (node-postgres | Data API)
  graphql/    The contract: schema.graphql, typed documents, persisted-operation manifest (generated)
infra/        AWS CDK app — Qa/* and Prod/* stages + one-time GitHub OIDC stack
.github/      ci.yml · deploy.yml (+ deploy-stage.yml) · mobile.yml (EAS) · desktop.yml (Electron)
docs/adr/     Architecture decision records
```

## Local development

Prerequisites: Node 24, Docker, and pnpm (`corepack enable`).

```bash
pnpm install
pnpm db:up                 # Postgres 17 + PostGIS on localhost:54329
pnpm db:migrate && pnpm db:seed
pnpm dev                   # API on :4000/graphql (GraphiQL) + Expo on :8081 (press w for web, i/a for simulators)
```

Locally, sign-in uses **dev mode**: `/sign-in` lists demo accounts (a member, a verified official, a newsroom and a support service), so you can try every permission level without Cognito. Deployed stages use **Google and Apple sign-in only** (see below).

| Command | What it does |
| --- | --- |
| `pnpm codegen` | Print the API schema, then regenerate typed documents + persisted manifest (commit the result) |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | All packages (API tests need the local DB; they use a separate `civic_test` database) |
| `pnpm --filter @civic/app build` | Production web export + SSR Lambda package |
| `pnpm --filter @civic/app serve` | Serve that build locally exactly as Lambda would |
| `pnpm --filter @civic/infra synth` | Synthesize CloudFormation for both stages |

## Environments and deployment

**QA** and **prod** are identical CDK stages (`Qa/*`, `Prod/*`) with different sizing and policies (see [ADR 0004](docs/adr/0004-aws-delivery.md)). Default region: `af-south-1` (Cape Town).

### One-time setup (per AWS account)

1. Bootstrap CDK: `pnpm --filter @civic/infra cdk bootstrap aws://<account>/af-south-1`
2. Create the GitHub deploy role: `pnpm --filter @civic/infra cdk deploy CivicGithubOidc` (set `GITHUB_OIDC_PROVIDER_ARN` if the account already has a GitHub OIDC provider). Note the `DeployRoleArn` output.
3. In GitHub → Settings → Environments, create **`qa`** and **`production`**. On each, set variables:
   - `AWS_DEPLOY_ROLE_ARN`, `AWS_ACCOUNT_ID`, `AWS_REGION` (e.g. `af-south-1`)
   - optional: `DOMAIN_NAME`, `CERTIFICATE_ARN` (us-east-1), `HOSTED_ZONE_ID`, `HOSTED_ZONE_NAME`, `ALARM_EMAIL`, and on `production` `API_RESERVED_CONCURRENCY` (e.g. `200`; needs an account Lambda concurrency quota of at least that plus 100, and new accounts start at 10)
4. On **`production`**, add required reviewers if you want a human approval between QA and prod. Without reviewers, every commit flows straight through once QA's smoke test passes.

After that, **every push to `main` deploys**: CI → `Qa/*` → smoke test → `Prod/*`.

### Sign-in: Google and Apple only

There are no email/password accounts: self sign-up is off and the app client offers only the configured providers. Until a provider is configured, sign-in is closed and the app says so. One Google client and one Apple Services ID serve both stages; register both Cognito domains with each (`civicone-qa-<account>` and `civicone-prod-<account>`, from the `CognitoDomain` stack outputs).

1. **Google** ([Cognito guide](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-social-idp-google.html)): in Google Auth Platform, add `amazoncognito.com` as an authorized domain, request only `openid`, `email`, `profile`, and create a **Web application** client:
   - Authorized JavaScript origins: `https://<cognito-domain>` (one per stage)
   - Authorized redirect URIs: `https://<cognito-domain>/oauth2/idpresponse` (one per stage)
2. **Apple** ([Cognito guide](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-social-idp-apple.html)): in Certificates, Identifiers & Profiles, enable Sign in with Apple on the App ID `app.civicone`, create a **Services ID** (e.g. `app.civicone.signin`) with Domains `<cognito-domain>` and Return URLs `https://<cognito-domain>/oauth2/idpresponse` for both stages, then create a Sign in with Apple **key** (download the `.p8`; note the Key ID and your Team ID).
3. Store the secrets in Secrets Manager as one secret, `civic/sso`, in the deploy region:
   ```bash
   node -e 'const fs=require("fs");process.stdout.write(JSON.stringify({googleClientSecret:fs.readFileSync(process.argv[1],"utf8").trim(),applePrivateKey:fs.readFileSync(process.argv[2],"utf8")}))' google-client-secret.txt AuthKey_XXXXXXXXXX.p8 > /tmp/sso.json
   aws secretsmanager create-secret --name civic/sso --secret-string file:///tmp/sso.json && rm /tmp/sso.json
   ```
4. Set repository variables (public IDs, not secrets): `GOOGLE_CLIENT_ID`, `APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`. Then re-run *Deploy*. Each provider switches on when its variables are set.

Native builds also need `EXPO_PUBLIC_SSO_PROVIDERS=apple,google` in their EAS environments.

### Mobile and desktop releases

- **iOS / Android:** run the *Mobile builds* workflow (EAS). Needs an `EXPO_TOKEN` secret, and these variables in the EAS project's `preview`/`production` environments: `EXPO_PUBLIC_API_URL` (`<SiteUrl>/graphql`), `EXPO_PUBLIC_SITE_URL`, `EXPO_PUBLIC_COGNITO_DOMAIN`, `EXPO_PUBLIC_COGNITO_CLIENT_ID` (all from the stack outputs).
- **Desktop:** push a `desktop-v*` tag or run *Desktop builds*. Set the `PROD_SITE_URL` repository variable; add signing secrets for notarised builds.
- **Wearables:** Wear OS runs the Android build; watchOS needs a small SwiftUI target (no JavaScript framework compiles to watchOS UI). See [ADR 0001](docs/adr/0001-universal-app.md#platform-matrix).

## Status

| Area | State |
| --- | --- |
| Web SSR app, API, database, tests | ✅ Working and verified locally (SSR output, hydration, sign-in, posting, privacy guard, likes, radar) |
| CDK stacks | ✅ Synthesize; Lambda bundles invoked locally against Postgres. **Not yet deployed to AWS.** |
| GitHub Actions | ✅ Written; runs once the repo is pushed and the one-time setup is done |
| iOS / Android binaries | ⚙️ Configured for EAS; not built yet (needs Expo + Apple/Google accounts) |
| Next up | Real-time alerts (subscriptions), image uploads + moderation queue, WAF, CSP, watchOS/Wear OS glance, bundle-size work |
