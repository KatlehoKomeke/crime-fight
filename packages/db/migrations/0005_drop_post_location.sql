-- Nearby, Live radar and location on posts are gone, and so is the location
-- data: less personal information held. The geography column (0002, outside
-- the Drizzle model) is generated from lat/lng, so it and its index go first.
DROP INDEX IF EXISTS "posts_location_gix";--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN IF EXISTS "location";--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "lat";--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "lng";
