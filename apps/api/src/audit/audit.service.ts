import { Injectable, Inject, Logger } from "@nestjs/common";
import { Prisma } from "@heizen/db";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";

type AuditActionName =
  | "DEPLOY_TRIGGERED"
  | "DESTROY_TRIGGERED"
  | "ENV_VARS_REPLACED"
  | "GITHUB_CONNECTION_ADDED"
  | "GITHUB_CONNECTION_REMOVED"
  | "USER_CREATED"
  | "USER_ROLE_CHANGED"
  | "USER_DELETED"
  | "PROJECT_DELETED"
  | "PROJECT_MEMBER_ADDED"
  | "PROJECT_MEMBER_ROLE_CHANGED"
  | "PROJECT_MEMBER_REMOVED";

type AuditResourceName =
  | "PROJECT"
  | "ENVIRONMENT"
  | "USER"
  | "GITHUB_CONNECTION"
  | "PROJECT_MEMBER";

export interface AuditEntry {
  actorId: string | null;
  action: AuditActionName;
  resourceType: AuditResourceName;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Insert an audit entry on the provided Prisma transaction client. This
   * method does NOT swallow errors — a failed audit write will roll the
   * surrounding transaction back. Use this for any operation where the
   * audit trail must be consistent with the primary state change.
   */
  async logInTx(
    tx: Prisma.TransactionClient,
    entry: AuditEntry,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        metadata: (entry.metadata ?? null) as never,
      },
    });
  }

  /**
   * Best-effort audit write. Never throws — audit failures must not affect
   * the user-facing operation that triggered them.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId ?? null,
          metadata: (entry.metadata ?? null) as never,
        },
      });
    } catch (err) {
      // Deliberately swallow: a transient DB blip on the audit path must NOT
      // turn a successful user op (deploy, env-var save, admin action) into
      // a 500 — that would be worse than missing a single trail row. The
      // structured error log + stack is the monitoring signal; an alert on
      // 'audit_write_failed' tags catches systemic failure.
      this.logger.error(
        {
          event: "audit_write_failed",
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId ?? null,
          err: err instanceof Error ? err.message : String(err),
        },
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  async list(opts: {
    take?: number;
    skip?: number;
    action?: AuditActionName;
    resourceType?: AuditResourceName;
    actorId?: string;
    resourceId?: string;
  }) {
    const take = Math.min(opts.take ?? 50, 200);
    const skip = opts.skip ?? 0;
    return this.prisma.auditLog.findMany({
      where: {
        action: opts.action,
        resourceType: opts.resourceType,
        actorId: opts.actorId,
        resourceId: opts.resourceId,
      },
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    });
  }
}
