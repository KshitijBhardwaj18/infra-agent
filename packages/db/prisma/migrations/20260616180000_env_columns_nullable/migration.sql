-- Relax Environment.name/slug/tier to nullable.
--
-- Production applies the schema with `prisma db push` (see apps/api/entrypoint.sh),
-- not `prisma migrate deploy`, and db push cannot add a NOT NULL column to the
-- already-populated Environment table without a backfill step. Making these
-- nullable lets the deploy add them cleanly; existing rows get NULL and the
-- app resolves a null slug/tier from `type` via resolveEnvDeploy(). New
-- scaffolded and custom environments always set explicit values.
ALTER TABLE "Environment"
  ALTER COLUMN "name" DROP NOT NULL,
  ALTER COLUMN "slug" DROP NOT NULL,
  ALTER COLUMN "tier" DROP NOT NULL;
