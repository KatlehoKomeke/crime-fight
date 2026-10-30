# ADR 0002 — Database: Aurora PostgreSQL Serverless v2 (+ PostGIS) over the RDS Data API

- **Status:** Accepted (October 2026)
- **Deciders:** Platform team
- **Context:** You asked whether something beats "plain Postgres" for CIVIC/ONE.

## What the workload needs

| Need | Why it matters here |
| --- | --- |
| **Geospatial radius queries** | "Nearby", Alerts and Live radar are `ST_DWithin` over post locations. This is core, not a nice-to-have. |
| **Relational integrity** | Users ↔ posts ↔ replies ↔ likes/saves/reposts ↔ follows ↔ topics. Counters must never drift from edges. |
| **Keyset pagination over time** | Every feed is "newest first, page by `(created_at, id)`". |
| **Full-text + fuzzy search** | Posts by text, people by handle/name. |
| **Low idle cost for QA** | QA sits idle most of the day. |
| **Runs in our AWS account, managed by CDK** | You required AWS + CDK, with QA and prod environments. |
| **TypeScript end to end** | Typed schema + queries shared by API and migrations. |

## Options researched

| Option | Geo (PostGIS) | Relational / FKs | Scale to zero | In our AWS acct via CDK | Notes |
| --- | --- | --- | --- | --- | --- |
| **Aurora PostgreSQL Serverless v2** ✅ | **Yes** | Full Postgres | **Yes** — 0 ACU auto-pause (since Nov 2024), ~15 s resume | **Yes** (`rds.DatabaseCluster`) | RDS **Data API** (HTTPS + IAM) is available in **af-south-1** for PG 17.4+, so Lambdas need no VPC, NAT, or connection pool. |
| Aurora DSQL | **No** — no extensions at all, PostGIS explicitly unsupported | Now supports FKs and sequences | Yes (truly serverless) | Yes | Max **3,000 rows per transaction**, one DDL per transaction, fixed Repeatable Read with optimistic concurrency (apps must retry serialization errors), no temp tables. Its real superpower is **multi-region active-active writes**, which we don't need yet. |
| Aurora "express configuration" (2026) | Yes | Full Postgres | Yes | **Not yet** — no CloudFormation support; needs custom resources | Creates a cluster in seconds without a VPC behind an internet-access gateway + IAM auth. The Data API is off at creation. Worth revisiting for ephemeral per-PR databases once CFN supports it. |
| Neon (serverless Postgres) | Yes | Full Postgres | Yes, resumes in ~hundreds of ms | **No** — third-party control plane | Best-in-class copy-on-write **branching** (great for preview environments). Now owned by Databricks; pricing has shifted since. Published SLA 99.95% vs Aurora Multi-AZ 99.99%. |
| PlanetScale Postgres | Yes | Full Postgres | **No** (fixed node pricing, no free tier) | **No** | Strong raw performance and a schema-change workflow; no scale-to-zero, so QA always costs money. |
| DynamoDB | No (needs geohash scheme) | No joins/FKs; single-table design | Effectively yes (on-demand) | Yes | Superb at massive, *predictable* access patterns. A poor fit for ad-hoc feeds, geo radius, search and a social graph — it would add OpenSearch and a lot of denormalisation on day one. |
| CockroachDB / YugabyteDB | Partial / yes | Postgres-compatible | Varies | Self-run on AWS or third-party SaaS | Distributed SQL; only pays off at multi-region scale, at real operational cost. |
| Neptune (graph) | No | Graph only | Serverless option | Yes | Overkill: the follow graph is one table and one index. |

## Decision

**Aurora PostgreSQL 17, Serverless v2, with PostGIS, `pg_trgm` and built-in full-text search, accessed from Lambda through the RDS Data API. Schema and migrations in Drizzle ORM.**

- **QA:** min 0 ACU / max 2, auto-pauses after 15 min idle (first request after a pause waits ~15 s; the client retries `DatabaseResumingException` transparently — see `packages/db/src/client.ts`).
- **Prod:** min 0.5 ACU / max 16, one reader that scales with the writer, deletion protection, 14-day backups.
- **Local/CI:** the same Postgres 17 + PostGIS 3.5 in Docker, over `node-postgres`; the Drizzle query builder is identical on both drivers.

Postgres was your starting point, and the research backs it. No alternative is better on the axes this product depends on (PostGIS, relational integrity, scale-to-zero, living in our AWS account under CDK). What changed from "just Postgres" is *how* we run it:

1. **Data API instead of drivers in a VPC.** No NAT gateway (~$35/month per AZ), no RDS Proxy (8-ACU minimum), no Lambda ENI cold starts, IAM instead of passwords in config.
2. **Single-statement counters.** Likes, reposts and their counts are changed in *one* data-modifying CTE (`apps/api/src/data/mutations.ts`), so the edge and the counter cannot drift and each toggle is one Data API round trip.
3. **Generated columns for geo and search.** `posts.location` (geography) and `posts.search` (tsvector) are generated from plain columns and indexed (GiST / GIN), and kept out of the ORM model so normal selects never ship binary payloads over the Data API.
4. **Millisecond timestamps** so keyset cursors built in JS round-trip exactly (no skipped rows between pages).

## Consequences and when to revisit

- **Multi-region active-active writes** become a requirement → evaluate DSQL again (only if PostGIS support lands) or an Aurora Global Database with a write-forwarding model.
- **Fan-out timelines at very large scale** (pre-computed home feeds, notifications) → add DynamoDB or ElastiCache Valkey *alongside* Postgres for those read models; Postgres stays the source of truth.
- **Search relevance** (typo tolerance, ranking, synonyms) outgrows Postgres FTS + trigram → OpenSearch Serverless fed from a change stream.
- **Per-PR preview databases** → Neon branching (third-party) or Aurora express configuration once it is in CloudFormation.
- **Data API limits:** 1 MB response cap per call and some type mapping quirks (timestamps, UUIDs). Pages are capped at 50 items, and raw SQL casts parameters explicitly (`::uuid`, `::timestamptz`).

## Sources

- AWS — [Unsupported PostgreSQL features in Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-unsupported-features.html)
- AWS — [Aurora Serverless v2 supports scaling to zero capacity](https://aws.amazon.com/about-aws/whats-new/2024/11/amazon-aurora-serverless-v2-scaling-zero-capacity)
- AWS — [Supported Regions and engines for RDS Data API](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.Aurora_Fea_Regions_DB-eng.Feature.Data_API.html)
- AWS — [Managing spatial data with PostGIS on Aurora PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Appendix.PostgreSQL.CommonDBATasks.PostGIS.html)
- [Aurora PostgreSQL express configuration with CDK and Drizzle](https://dev.to/aws-builders/aurora-postgresql-serverless-express-configuration-with-cdk-and-drizzle-4hi7)
- [Serverless Postgres compared (2026)](https://www.prisma.io/blog/serverless-postgres) · [PostgreSQL hosting options in 2026](https://www.bytebase.com/blog/postgres-hosting-options-pricing-comparison/) · [Neon after Databricks](https://www.buildmvpfast.com/blog/neon-serverless-postgres-databricks-comparison-pricing-2026)
