import {
  Injectable,
  Inject,
  Optional,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";
import { GithubTokenService } from "./github-token.service";
import { getInstallationMeta } from "@heizen/infra-core";
import { AuditLogService } from "../audit/audit.service";

interface AggregatedRepo {
  connectionId: string;
  installationId: string;
  accountLogin: string;
  full_name: string;
  name: string;
  owner: string;
  default_branch: string;
  private: boolean;
}

@Injectable()
export class GithubConnectionsService {
  private readonly logger = new Logger(GithubConnectionsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly tokenService: GithubTokenService,
    @Optional() private readonly audit?: AuditLogService,
  ) {}

  async list() {
    const rows = await this.prisma.githubConnection.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        installationId: true,
        accountLogin: true,
        accountType: true,
        createdAt: true,
        addedBy: { select: { id: true, name: true, email: true } },
      },
    });
    return rows;
  }

  async register(installationId: string, addedByUserId: string | null) {
    const meta = await this.fetchInstallationMeta(installationId);
    if (!meta.account) {
      throw new BadRequestException(
        "GitHub returned an installation with no account information",
      );
    }
    const accountLogin = meta.account.login;
    const accountType =
      meta.account.type === "Organization" ? "ORGANIZATION" : "USER";

    let created: Awaited<ReturnType<typeof this.prisma.githubConnection.create>>;
    try {
      if (this.audit) {
        const audit = this.audit;
        created = await this.prisma.$transaction(async (tx) => {
          const row = await tx.githubConnection.create({
            data: {
              installationId,
              accountLogin,
              accountType,
              addedByUserId,
            },
          });
          await audit.logInTx(tx, {
            actorId: addedByUserId,
            action: "GITHUB_CONNECTION_ADDED",
            resourceType: "GITHUB_CONNECTION",
            resourceId: row.id,
            metadata: { installationId, accountLogin, accountType },
          });
          return row;
        });
      } else {
        created = await this.prisma.githubConnection.create({
          data: {
            installationId,
            accountLogin,
            accountType,
            addedByUserId,
          },
        });
      }
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        throw new ConflictException(
          `GitHub installation ${installationId} is already connected (${accountLogin}).`,
        );
      }
      throw err;
    }

    return created;
  }

  async remove(connectionId: string, actorId?: string | null) {
    const conn = await this.prisma.githubConnection.findUnique({
      where: { id: connectionId },
      select: { id: true, installationId: true, accountLogin: true },
    });
    if (!conn) throw new NotFoundException("Connection not found");

    const usingProjects = await this.prisma.project.count({
      where: { githubInstallationId: conn.installationId },
    });
    if (usingProjects > 0) {
      throw new ConflictException(
        `Cannot remove connection "${conn.accountLogin}" — ${usingProjects} project(s) use this installation. Reassign or disconnect them first.`,
      );
    }

    if (this.audit) {
      const audit = this.audit;
      await this.prisma.$transaction(async (tx) => {
        await tx.githubConnection.delete({ where: { id: connectionId } });
        await audit.logInTx(tx, {
          actorId: actorId ?? null,
          action: "GITHUB_CONNECTION_REMOVED",
          resourceType: "GITHUB_CONNECTION",
          resourceId: connectionId,
          metadata: { installationId: conn.installationId, accountLogin: conn.accountLogin },
        });
      });
    } else {
      await this.prisma.githubConnection.delete({ where: { id: connectionId } });
    }

    return { ok: true };
  }

  /**
   * Aggregate repos across all connections. Deduplicated by full_name; on
   * collision the first connection wins (lowest createdAt). Each repo is
   * annotated with the connectionId so the caller knows which installation
   * token to use when cloning.
   */
  async listAllRepos() {
    const connections = await this.prisma.githubConnection.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, installationId: true, accountLogin: true },
    });
    if (connections.length === 0) return [];

    const reposByFullName = new Map<string, AggregatedRepo>();

    for (const conn of connections) {
      let token: string;
      try {
        token = await this.tokenService.getToken(conn.installationId);
      } catch (err) {
        this.logger.warn(
          `Failed to get token for connection ${conn.id} (${conn.accountLogin}): ${err instanceof Error ? err.message : err}`,
        );
        continue;
      }

      for (const repo of await this.fetchInstallationRepos(token, conn)) {
        if (!reposByFullName.has(repo.full_name)) {
          reposByFullName.set(repo.full_name, repo);
        }
      }
    }

    return [...reposByFullName.values()];
  }

  private async fetchInstallationRepos(
    token: string,
    conn: { id: string; installationId: string; accountLogin: string },
  ): Promise<AggregatedRepo[]> {
    const out: AggregatedRepo[] = [];
    let url: string | null =
      "https://api.github.com/installation/repositories?per_page=100&page=1";
    let page = 0;

    while (url && page < 50) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (res.status === 401 || res.status === 403) {
        this.logger.warn(
          `Connection ${conn.id} (${conn.accountLogin}) installation revoked at GitHub`,
        );
        return out;
      }
      if (res.status >= 500) {
        throw new ServiceUnavailableException("GitHub API unavailable");
      }
      if (!res.ok) return out;

      const data = (await res.json()) as {
        repositories?: Array<{
          full_name: string;
          name: string;
          owner: { login: string };
          default_branch: string;
          private: boolean;
        }>;
      };
      for (const r of data.repositories ?? []) {
        out.push({
          connectionId: conn.id,
          installationId: conn.installationId,
          accountLogin: conn.accountLogin,
          full_name: r.full_name,
          name: r.name,
          owner: r.owner.login,
          default_branch: r.default_branch,
          private: r.private,
        });
      }
      url = parseNextLink(res.headers.get("link"));
      page++;
    }
    return out;
  }

  /**
   * Lists branches for a repo accessible via the given installation.
   * Caps pagination at 5 pages (500 branches) which is enough for the
   * vast majority of repos; UI provides a text filter for navigation.
   */
  async listBranches(
    installationId: string,
    owner: string,
    repo: string,
  ): Promise<Array<{ name: string; protected: boolean }>> {
    const conn = await this.prisma.githubConnection.findFirst({
      where: { installationId },
      select: { id: true, accountLogin: true },
    });
    if (!conn) {
      throw new NotFoundException(
        `No GitHub connection found for installation ${installationId}`,
      );
    }

    let token: string;
    try {
      token = await this.tokenService.getToken(installationId);
    } catch (err) {
      throw new ServiceUnavailableException(
        `Failed to get installation token: ${err instanceof Error ? err.message : err}`,
      );
    }

    const out: Array<{ name: string; protected: boolean }> = [];
    let url: string | null = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100&page=1`;
    let page = 0;

    while (url && page < 5) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (res.status === 404) {
        throw new NotFoundException(
          `Repository "${owner}/${repo}" not found or not accessible to installation ${installationId}`,
        );
      }
      if (res.status === 401 || res.status === 403) {
        throw new BadRequestException(
          "GitHub denied access to this repository (installation may have lost access).",
        );
      }
      if (res.status >= 500) {
        throw new ServiceUnavailableException("GitHub API unavailable");
      }
      if (!res.ok) return out;

      const data = (await res.json()) as Array<{
        name: string;
        protected: boolean;
      }>;
      for (const b of data) {
        out.push({ name: b.name, protected: b.protected });
      }
      url = parseNextLink(res.headers.get("link"));
      page++;
    }
    return out;
  }

  private async fetchInstallationMeta(installationId: string) {
    try {
      return await getInstallationMeta(installationId);
    } catch (err) {
      const status =
        err && typeof err === "object" && "status" in err
          ? (err as { status: number }).status
          : undefined;
      if (status === 404) {
        throw new NotFoundException(
          `GitHub installation ${installationId} not found (revoked?)`,
        );
      }
      if (status !== undefined) {
        throw new ServiceUnavailableException(
          `GitHub returned ${status} when looking up installation`,
        );
      }
      throw new ServiceUnavailableException(
        `Failed to look up GitHub installation: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  const parts = header.split(",");
  for (const part of parts) {
    const m = /<([^>]+)>;\s*rel="next"/.exec(part);
    if (m) return m[1] ?? null;
  }
  return null;
}
