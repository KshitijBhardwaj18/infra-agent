-- Migrate legacy enum values before shrinking enums
UPDATE "DeploymentLog" SET "phase" = 'SYSTEM' WHERE "phase" IN ('DOCKER_BUILD', 'DOCKER_PUSH');
UPDATE "Deployment" SET "status" = 'DEPLOYING' WHERE "status" IN ('BUILDING', 'PUSHING');

-- AlterEnum
BEGIN;
CREATE TYPE "DeploymentPhase_new" AS ENUM ('PULUMI', 'SYSTEM');
ALTER TABLE "DeploymentLog" ALTER COLUMN "phase" TYPE "DeploymentPhase_new" USING ("phase"::text::"DeploymentPhase_new");
ALTER TYPE "DeploymentPhase" RENAME TO "DeploymentPhase_old";
ALTER TYPE "DeploymentPhase_new" RENAME TO "DeploymentPhase";
DROP TYPE "DeploymentPhase_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "DeploymentStatus_new" AS ENUM ('QUEUED', 'DEPLOYING', 'SUCCESS', 'FAILED', 'CANCELLED');
ALTER TABLE "Deployment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Deployment" ALTER COLUMN "status" TYPE "DeploymentStatus_new" USING ("status"::text::"DeploymentStatus_new");
ALTER TYPE "DeploymentStatus" RENAME TO "DeploymentStatus_old";
ALTER TYPE "DeploymentStatus_new" RENAME TO "DeploymentStatus";
DROP TYPE "DeploymentStatus_old";
ALTER TABLE "Deployment" ALTER COLUMN "status" SET DEFAULT 'QUEUED';
COMMIT;

-- AlterTable
ALTER TABLE "Deployment" DROP COLUMN "dockerfilePath",
DROP COLUMN "ecrUri",
DROP COLUMN "imageTag",
ADD COLUMN     "imageUri" TEXT;

-- AlterTable
ALTER TABLE "Environment" DROP COLUMN "codebuildProjectName",
DROP COLUMN "ecrUri",
ADD COLUMN     "imageUri" TEXT;
