-- Existing development users have no display name yet. Fill those rows, then
-- drop the default so later inserts must provide a name.
ALTER TABLE "users" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';

ALTER TABLE "users" ALTER COLUMN "name" DROP DEFAULT;
