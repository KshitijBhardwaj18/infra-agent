-- Multi-environment support: add name/slug/tier to Environment, extend the
-- EnvironmentType enum with CUSTOM, and key environments by (projectId, slug)
-- instead of (projectId, type) so a project can have more than two.

-- 1. Add the EnvTier enum + new columns (nullable first), then backfill from
--    the existing type so every current row is fully populated.
CREATE TYPE "EnvTier" AS ENUM ('STAGING', 'PRODUCTION');

ALTER TABLE "Environment"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "tier" "EnvTier";

UPDATE "Environment" SET
  "slug" = lower("type"::text),
  "name" = initcap(lower("type"::text)),
  "tier" = ("type"::text)::"EnvTier";

-- Fail loudly if any row was left unpopulated, so a bad backfill surfaces
-- here rather than as a generic NOT NULL violation in step 3.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Environment"
    WHERE "slug" IS NULL OR "name" IS NULL OR "tier" IS NULL
  ) THEN
    RAISE EXCEPTION 'Environment backfill incomplete: null slug/name/tier remain';
  END IF;
END $$;

-- 2. Extend EnvironmentType with CUSTOM. Postgres has no transaction-safe
--    DROP VALUE and Prisma wraps migrations in a transaction, so we recreate
--    the type (same recipe as the grafana enum change). Only Environment.type
--    uses it, with no column default, so nothing to drop/restore.
ALTER TYPE "EnvironmentType" RENAME TO "EnvironmentType_old";
CREATE TYPE "EnvironmentType" AS ENUM ('STAGING', 'PRODUCTION', 'CUSTOM');
ALTER TABLE "Environment" ALTER COLUMN "type" TYPE "EnvironmentType" USING ("type"::text::"EnvironmentType");
DROP TYPE "EnvironmentType_old";

-- 3. Lock down the backfilled columns and swap the uniqueness key from
--    (projectId, type) to (projectId, slug).
ALTER TABLE "Environment"
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "slug" SET NOT NULL,
  ALTER COLUMN "tier" SET NOT NULL;

DROP INDEX "Environment_projectId_type_key";
CREATE UNIQUE INDEX "Environment_projectId_slug_key" ON "Environment"("projectId", "slug");
