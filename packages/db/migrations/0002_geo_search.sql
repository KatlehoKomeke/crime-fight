-- Generated columns kept out of the Drizzle model (see src/schema.ts).
ALTER TABLE "posts" ADD COLUMN "location" geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography) STORED;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "search" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("area", '') || ' ' || "body")) STORED;
--> statement-breakpoint
CREATE INDEX "posts_location_gix" ON "posts" USING gist ("location") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "posts_search_gin" ON "posts" USING gin ("search");
--> statement-breakpoint
CREATE INDEX "users_handle_trgm" ON "users" USING gin ("handle" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "users_display_name_trgm" ON "users" USING gin ("display_name" gin_trgm_ops);
