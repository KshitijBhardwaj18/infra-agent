-- Remove GRAFANA from the IncidentSource enum.
-- Postgres has no ALTER TYPE ... DROP VALUE, so we recreate the type. Any
-- incidents that used GRAFANA are dropped first (dev only — Grafana alert
-- ingestion was never enabled, so none are expected). Incident.source has
-- no column default, so no default needs dropping/restoring.
DELETE FROM "Incident" WHERE "source" = 'GRAFANA';

ALTER TYPE "IncidentSource" RENAME TO "IncidentSource_old";
CREATE TYPE "IncidentSource" AS ENUM ('HEALTHCHECK', 'AGENT', 'MANUAL', 'DEPLOYMENT', 'LOGS', 'METRICS');
ALTER TABLE "Incident" ALTER COLUMN "source" TYPE "IncidentSource" USING ("source"::text::"IncidentSource");
DROP TYPE "IncidentSource_old";
