-- Extensions must exist before tables that use their types.
-- On Aurora the cluster admin (used by the migration Lambda) holds rds_superuser.
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
