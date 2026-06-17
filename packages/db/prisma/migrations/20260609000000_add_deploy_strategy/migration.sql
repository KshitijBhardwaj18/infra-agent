-- CreateEnum
CREATE TYPE "DeployStrategy" AS ENUM ('ECS', 'EC2_COMPOSE', 'LIGHTSAIL');

-- AlterTable
ALTER TABLE "Environment" ADD COLUMN "deployStrategy" "DeployStrategy",
ADD COLUMN "ec2InstanceType" TEXT;
