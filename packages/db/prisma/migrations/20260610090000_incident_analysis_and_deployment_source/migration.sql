-- AlterEnum
ALTER TYPE "IncidentSource" ADD VALUE 'DEPLOYMENT';

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN "analysis" JSONB;
