import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../common/guards/auth.guard";
import { SystemRoleGuard, RequireSystemRole } from "../common/rbac";
import { AuditLogService } from "./audit.service";

const ALLOWED_ACTIONS = new Set([
  "DEPLOY_TRIGGERED",
  "ENV_VARS_REPLACED",
  "GITHUB_CONNECTION_ADDED",
  "GITHUB_CONNECTION_REMOVED",
  "USER_CREATED",
  "USER_ROLE_CHANGED",
  "USER_DELETED",
  "PROJECT_DELETED",
  "PROJECT_MEMBER_ADDED",
  "PROJECT_MEMBER_ROLE_CHANGED",
  "PROJECT_MEMBER_REMOVED",
]);

const ALLOWED_RESOURCE_TYPES = new Set([
  "PROJECT",
  "ENVIRONMENT",
  "USER",
  "GITHUB_CONNECTION",
  "PROJECT_MEMBER",
]);

function parseNonNegativeInt(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new BadRequestException(`${name} must be a non-negative integer`);
  }
  return n;
}

@Controller("api/admin/audit-log")
@UseGuards(AuthGuard, SystemRoleGuard)
@RequireSystemRole("ADMIN")
export class AuditController {
  constructor(private readonly audit: AuditLogService) {}

  @Get()
  list(
    @Query("take") take?: string,
    @Query("skip") skip?: string,
    @Query("action") action?: string,
    @Query("resourceType") resourceType?: string,
    @Query("actorId") actorId?: string,
    @Query("resourceId") resourceId?: string,
  ) {
    const parsedTake = parseNonNegativeInt(take, "take");
    const parsedSkip = parseNonNegativeInt(skip, "skip");

    if (action && !ALLOWED_ACTIONS.has(action)) {
      throw new BadRequestException(`Invalid action filter "${action}"`);
    }
    if (resourceType && !ALLOWED_RESOURCE_TYPES.has(resourceType)) {
      throw new BadRequestException(`Invalid resourceType filter "${resourceType}"`);
    }

    return this.audit.list({
      take: parsedTake,
      skip: parsedSkip,
      action: action as never,
      resourceType: resourceType as never,
      actorId,
      resourceId,
    });
  }
}
