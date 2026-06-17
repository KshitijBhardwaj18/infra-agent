-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM (
  'DEPLOY_TRIGGERED',
  'ENV_VARS_REPLACED',
  'GITHUB_CONNECTION_ADDED',
  'GITHUB_CONNECTION_REMOVED',
  'USER_CREATED',
  'USER_ROLE_CHANGED',
  'USER_DELETED',
  'PROJECT_DELETED',
  'PROJECT_MEMBER_ADDED',
  'PROJECT_MEMBER_ROLE_CHANGED',
  'PROJECT_MEMBER_REMOVED'
);

-- CreateEnum
CREATE TYPE "AuditResource" AS ENUM (
  'PROJECT',
  'ENVIRONMENT',
  'USER',
  'GITHUB_CONNECTION',
  'PROJECT_MEMBER'
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "AuditAction" NOT NULL,
    "resourceType" "AuditResource" NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
