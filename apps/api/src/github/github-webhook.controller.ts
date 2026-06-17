import {
  Controller,
  Post,
  Req,
  Res,
  Logger,
  Inject,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";
import { EventsGateway } from "../websocket/events.gateway";
import { env } from "../common/env";

function verifyWebhookSignature(body: Buffer, signature: string | undefined): boolean {
  const secret = env("GITHUB_WEBHOOK_SECRET");
  if (!secret) {
    if (
      process.env.NODE_ENV === "development" &&
      process.env.ALLOW_UNSIGNED_GITHUB_WEBHOOKS === "1"
    ) {
      return true;
    }
    return false;
  }
  if (!signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const expectedBuf = Buffer.from(`sha256=${expected}`);
  const actualBuf = Buffer.from(signature);
  return (
    actualBuf.length === expectedBuf.length &&
    timingSafeEqual(actualBuf, expectedBuf)
  );
}

@Controller("api/github/webhooks")
export class GithubWebhookController {
  private readonly logger = new Logger(GithubWebhookController.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly gateway: EventsGateway,
  ) {}

  @Post()
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    // Raw body is attached by the raw-body middleware in main.ts
    const rawBody: Buffer = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    const event = req.headers["x-github-event"] as string | undefined;

    if (!verifyWebhookSignature(rawBody, signature)) {
      this.logger.warn("GitHub webhook signature verification failed");
      return res.status(401).json({ error: "Invalid signature" });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString()) as Record<string, unknown>;
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    try {
      await this.processEvent(event ?? "", payload);
    } catch (err) {
      this.logger.error(
        `Error processing GitHub webhook "${event}": ${err instanceof Error ? err.message : err}`,
      );
      return res.status(500).json({ error: "Processing failed" });
    }

    return res.status(200).json({ ok: true });
  }

  private async processEvent(
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (event !== "installation" && event !== "installation_repositories") return;

    const action = payload.action as string | undefined;
    const installation = payload.installation as
      | { id: number; account?: { login: string } }
      | undefined;

    if (!installation?.id) return;

    const installationId = String(installation.id);

    // Installation deleted or suspended: clear from all affected projects
    if (event === "installation" && (action === "deleted" || action === "suspend")) {
      this.logger.log(
        `GitHub installation ${installationId} ${action} — clearing from projects`,
      );
      const projects = await this.prisma.project.findMany({
        where: { githubInstallationId: installationId },
        select: { id: true, organizationId: true, slug: true },
      });

      if (projects.length === 0) return;

      await this.prisma.project.updateMany({
        where: { githubInstallationId: installationId },
        data: {
          githubInstallationId: null,
          githubOwner: null,
          githubRepo: null,
          githubBranch: null,
        },
      });

      // Notify each org's connected clients so the UI refreshes
      const orgIds = [...new Set(projects.map((p) => p.organizationId))];
      for (const orgId of orgIds) {
        this.gateway.emitGithubDisconnected(orgId, {
          projectIds: projects
            .filter((p) => p.organizationId === orgId)
            .map((p) => p.id),
          reason: action === "deleted" ? "uninstalled" : "suspended",
        });
      }

      this.logger.log(
        { event, action, installationId, affectedProjects: projects.map((p) => p.id) },
        "GitHub webhook applied",
      );
    }

    // Repos removed from installation: find projects using those repos and disconnect them
    if (event === "installation_repositories" && action === "removed") {
      const removed = (
        payload.repositories_removed as Array<{ full_name: string }> | undefined
      ) ?? [];

      if (removed.length === 0) return;

      for (const removedRepo of removed) {
        const [owner, repo] = removedRepo.full_name.split("/");
        if (!owner || !repo) continue;

        const projects = await this.prisma.project.findMany({
          where: {
            githubInstallationId: installationId,
            githubOwner: owner,
            githubRepo: repo,
          },
          select: { id: true, organizationId: true },
        });

        if (projects.length === 0) continue;

        await this.prisma.project.updateMany({
          where: {
            githubInstallationId: installationId,
            githubOwner: owner,
            githubRepo: repo,
          },
          data: {
            githubOwner: null,
            githubRepo: null,
            githubBranch: null,
            // Keep githubInstallationId — the app is still installed, just
            // this repo was removed. User can pick a different repo.
          },
        });

        const orgIds = [...new Set(projects.map((p) => p.organizationId))];
        for (const orgId of orgIds) {
          this.gateway.emitGithubDisconnected(orgId, {
            projectIds: projects
              .filter((p) => p.organizationId === orgId)
              .map((p) => p.id),
            reason: "repo_removed",
          });
        }

        this.logger.log(
          {
            event,
            action,
            installationId,
            repo: removedRepo.full_name,
            affectedProjects: projects.map((p) => p.id),
          },
          "GitHub webhook applied",
        );
      }
    }
  }
}
