import { SetMetadata } from "@nestjs/common";

export const SYSTEM_ROLES_KEY = "rbac.systemRoles";
export const PROJECT_ROLES_KEY = "rbac.projectRoles";

export type SystemRoleName = "ADMIN" | "MEMBER";
export type ProjectRoleName = "OWNER" | "DEPLOYER" | "VIEWER";

export const RequireSystemRole = (...roles: SystemRoleName[]) =>
  SetMetadata(SYSTEM_ROLES_KEY, roles);

export const RequireProjectRole = (...roles: ProjectRoleName[]) =>
  SetMetadata(PROJECT_ROLES_KEY, roles);
