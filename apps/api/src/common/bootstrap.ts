import type { PrismaClient } from "@heizen/db";
import { prisma } from "@heizen/db";
import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import { env } from "./env";

const DEFAULT_ORG_NAME_FALLBACK = "Heizen";
const DEFAULT_ORG_SLUG_FALLBACK = "heizen";

/**
 * Ensures exactly-one default Organization exists, all users are members of it,
 * and the bootstrap admin (if configured and present) has systemRole=ADMIN.
 * Idempotent — safe to run on every API boot.
 */
export async function bootstrapSingleOrg(
  prisma: PrismaClient,
  logger: Logger,
): Promise<void> {
  const name = process.env.DEFAULT_ORG_NAME?.trim() || DEFAULT_ORG_NAME_FALLBACK;
  const slug = process.env.DEFAULT_ORG_SLUG?.trim() || DEFAULT_ORG_SLUG_FALLBACK;

  let org = await prisma.organization.findFirst({
    where: { OR: [{ slug }, { name }] },
    orderBy: { createdAt: "asc" },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        id: randomUUID(),
        name,
        slug,
        createdAt: new Date(),
      },
    });
    logger.log(`Bootstrapped default organization "${name}" (${org.id})`);
  }

  // NOTE: any email-based admin promotion was removed. The only path that
  // assigns ADMIN is bootstrapAdminUser (first-boot, empty-User-table) or an
  // explicit admin action via /api/admin/users. Promoting on every boot
  // re-elevated demoted users and was a privilege-escalation vector if an
  // admin created a member account that happened to match the bootstrap
  // email.

  const orphanUsers = await prisma.user.findMany({
    where: { members: { none: { organizationId: org.id } } },
    select: { id: true },
  });
  if (orphanUsers.length > 0) {
    await prisma.member.createMany({
      data: orphanUsers.map((u) => ({
        id: randomUUID(),
        organizationId: org!.id,
        userId: u.id,
        role: "member",
        createdAt: new Date(),
      })),
      skipDuplicates: true,
    });
    logger.log(`Auto-joined ${orphanUsers.length} user(s) to default organization`);
  }
}

export async function bootstrapAdminUser(logger: Logger): Promise<void> {
  const email = env("BOOTSTRAP_ADMIN_EMAIL")?.toLowerCase();
  const password = env("BOOTSTRAP_ADMIN_PASSWORD");
  if (!email || !password) return;

  const anyUser = await prisma.user.findFirst({ select: { id: true } });
  if (anyUser) return;

  if (password.length < 12) {
    logger.error(
      "BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters; skipping admin bootstrap",
    );
    return;
  }

  let createdUserId: string | undefined;
  try {
    const { auth } = await import("../auth/auth.config");
    const created = await auth.api.signUpEmail({
      body: { email, name: "Heizen Admin", password },
      asResponse: false,
    });
    if (!created?.user) {
      logger.error("Failed to bootstrap admin user (no user returned)");
      return;
    }
    createdUserId = created.user.id;

    try {
      // Resolve default org + promote to ADMIN + add Member row in one tx.
      // bootstrapSingleOrg runs before this so the org should exist; we look
      // it up by slug/name so the lookup matches the bootstrap policy.
      const orgName = env("DEFAULT_ORG_NAME") ?? "Heizen";
      const orgSlug = env("DEFAULT_ORG_SLUG") ?? "heizen";
      const org = await prisma.organization.findFirst({
        where: { OR: [{ slug: orgSlug }, { name: orgName }] },
        orderBy: { createdAt: "asc" },
      });
      if (!org) {
        throw new Error("Default organization missing — bootstrapSingleOrg did not run");
      }

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: createdUserId! },
          data: { systemRole: "ADMIN" },
        });
        await tx.member.create({
          data: {
            id: randomUUID(),
            organizationId: org.id,
            userId: createdUserId!,
            role: "member",
            createdAt: new Date(),
          },
        });
      });
    } catch (err) {
      // Compensating delete — if we can't promote + join, an unprivileged
      // 'Heizen Admin' account with the bootstrap email is worse than no
      // account. Cascade clears the linked Account/Session rows.
      await prisma.user
        .delete({ where: { id: createdUserId } })
        .catch(() => undefined);
      throw err;
    }

    logger.log(`Bootstrapped admin user "${email}"`);
  } catch (err) {
    logger.error(
      `Failed to bootstrap admin user: ${err instanceof Error ? err.message : err}`,
    );
  }
}

export async function bootstrapGithubConnection(
  prisma: PrismaClient,
  logger: Logger,
): Promise<void> {
  const envInstallationId = process.env.BOOTSTRAP_GITHUB_INSTALLATION_ID?.trim();
  if (!envInstallationId) return;

  try {
    const existing = await prisma.githubConnection.findUnique({
      where: { installationId: envInstallationId },
    });
    if (existing) return;

    const anyOther = await prisma.githubConnection.count();
    if (anyOther > 0) {
      logger.log(
        "BOOTSTRAP_GITHUB_INSTALLATION_ID set but other connections already exist — skipping bootstrap (use admin panel to add).",
      );
      return;
    }

    const { GithubConnectionsService } = await import("../github/github-connections.service");
    const { GithubTokenService } = await import("../github/github-token.service");
    const svc = new GithubConnectionsService(prisma, new GithubTokenService());
    const conn = await svc.register(envInstallationId, null);
    logger.log(
      `Bootstrapped GitHub connection "${conn.accountLogin}" from BOOTSTRAP_GITHUB_INSTALLATION_ID`,
    );
  } catch (err) {
    logger.error(
      `Failed to bootstrap GitHub connection from BOOTSTRAP_GITHUB_INSTALLATION_ID: ${err instanceof Error ? err.message : err}`,
    );
  }
}
