# ADR 0004 — AWS hosting with CDK, QA + prod, deploy on every commit

- **Status:** Accepted (October 2026)

## Topology (per stage)

```
                        ┌────────────── CloudFront (one origin, HTTP/2+3, security headers) ──────────────┐
 browser / app ────────►│ /_expo/static/* /assets/* /robots.txt ─► S3 (OAC, immutable hashed bundles)     │
                        │ /graphql ─────────────────────────────► API Gateway HTTP API ─► GraphQL Lambda ─┼─► Aurora PG 17 (Data API)
                        │ /* (pages, /_expo/loaders/*) ─────────► SSR Lambda (Function URL, OAC, stream) ─┼─► GraphQL (server prefetch)
                        └──────────────────────────────────────────────────────────────────────────────────┘
 Cognito user pool (managed login, PKCE) · CloudWatch alarms → SNS · X-Ray tracing
 AppSync Events (WebSocket) ◄── app subscribes to its inbox channel; the GraphQL Lambda publishes (IAM), see ADR 0005
```

CDK app: `infra/`. Stacks per stage: **Data** (isolated VPC, Aurora), **Auth** (Cognito), **Api** (GraphQL Lambda, HTTP API, migrations Trigger, alarms) and **Web** (S3, SSR Lambda, CloudFront, Cognito app client).

## Key choices

- **Same-origin everything.** No CORS for the browser, one TLS connection, simpler CSP later.
- **SSR on Lambda with response streaming** behind CloudFront using **Origin Access Control** (the Function URL is IAM-only; only CloudFront can call it).
- **Pages and the API aren't cached at the edge** (November 2026). CloudFront has no regional edge cache in Africa, so a cacheable request that missed at the Cape Town edge went to one in Europe and back to af-south-1. Measured on prod, that added about 550ms to every signed-in read, to every page not already cached and to every in-app navigation. Cached copies were faster (about 0.1s), but only for the few pages a warmer kept fresh. With caching disabled, requests go straight from the edge to the origin: about 0.1s to the API and 0.2–0.3s for a rendered page. The Lambdas compress their own responses, because CloudFront doesn't compress uncached or streamed responses. To absorb spikes, Lambda now scales instead (quota 1000). The SSR Lambda also shares identical anonymous API calls for 5s, so a burst of page views doesn't become a burst of database queries. A prod warmer requests the main pages once a minute to avoid cold starts.
- **App Runner was ruled out:** AWS closed it to new customers on 30 April 2026. ECS Express Mode is the long-running alternative if Lambda ever stops fitting.
- **Migrations run as a CDK Trigger** before the new API version is deployed. A failed migration fails the deploy, and the old API keeps serving.
- **Build once, promote.** CI builds the web bundle once; the same artefact deploys to QA and then prod. Runtime config (site URL, Cognito client) is read at request time, so nothing environment-specific is baked into the bundle.
- **Breaking a CloudFormation cycle.** The Cognito app client's callback URL needs the CloudFront domain, while CloudFront needs the SSR function. The SSR Lambda therefore reads `{siteUrl, cognitoClientId}` from SSM at cold start, and the API accepts ID tokens from any app client of *our* user pool.
- **Sign-in is Google and Apple only, at first.** Self sign-up is off (it blocks only email/password; Cognito still creates federated users on first sign-in), the app client offers only the configured providers and allows no password auth flows, and the app's buttons pass `identity_provider` so users go straight to the provider. Apple is included because the App Store requires it alongside Google sign-in. Provider IDs are GitHub variables; their secrets live in Secrets Manager (`civic/sso`) and reach Cognito as CloudFormation dynamic references.
- **No NAT gateways.** Lambdas reach Aurora over the Data API (IAM-authenticated HTTPS).
- **GitHub OIDC.** No long-lived AWS keys in GitHub; the deploy role can only assume CDK bootstrap roles, and only from this repo's `qa` and `production` environments.

## Delivery

```
push to main ─► CI (lint · typecheck · unit + integration tests on PostGIS · SSR build · cdk synth)
            ─► deploy Qa/*  ─► smoke test (SSR HTML + persisted GraphQL through CloudFront → Aurora)
            ─► deploy Prod/* (gate with required reviewers on the `production` environment)
pull request ─► CI only
```

| | QA | Prod |
| --- | --- | --- |
| Aurora | 0–2 ACU, auto-pause after 15 min | 0–4 ACU, auto-pause after 15 min, no reader, deletion protection, 14-day backups (pre-launch, to keep the bill near storage only; add a reader and a 0.5 ACU floor at launch) |
| GraphQL | Ad-hoc queries allowed, GraphiQL on | **Persisted operations only**, GraphiQL off, optional reserved concurrency (`API_RESERVED_CONCURRENCY`) |
| Cognito | Extra `localhost` callback for testing | Deletion protection, retained on stack delete |

## Not done yet (recommended next)

- AWS WAF on CloudFront (rate limiting, bot control) — needs a us-east-1 stack.
- A Content-Security-Policy header (needs nonces for the inline config script).
- A custom domain + ACM certificate (supported via config; set `DOMAIN_NAME`, `CERTIFICATE_ARN`, `HOSTED_ZONE_*`).
- Per-PR ephemeral environments.
