import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";
import { EnvironmentsService } from "../environments/environments.service";
import { EncryptionService } from "../common/services/encryption.service";

/**
 * Source types we know how to read. Manually maintained for now — adding a
 * type needs a code change here plus a reader; a dynamic plugin registry is
 * future work (tracked as a known limitation, not a blocker for groundwork).
 */
export const DATA_SOURCE_TYPES = ["grafana-loki"] as const;
export type DataSourceType = (typeof DATA_SOURCE_TYPES)[number];

interface CreateInput {
  type: string;
  displayName: string;
  config: Record<string, unknown>;
}

/** What the UI sees — never the decrypted secrets. */
interface PublicConnection {
  id: string;
  type: string;
  displayName: string;
  enabled: boolean;
  createdAt: Date;
}

/**
 * Per-environment connections to external observability sources (the
 * customer's own Grafana/Loki today; more plugin types later). The
 * `config` blob is encrypted at rest exactly like env-var secrets; only
 * the source readers decrypt it on use (follow-up work), never the API.
 */
@Injectable()
export class DataSourcesService {
  private readonly logger = new Logger(DataSourcesService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly environments: EnvironmentsService,
    private readonly encryption: EncryptionService,
  ) {}

  async list(
    orgId: string,
    projectId: string,
    envId: string,
  ): Promise<PublicConnection[]> {
    await this.environments.get(orgId, projectId, envId);
    const rows = await this.prisma.dataSourceConnection.findMany({
      where: { environmentId: envId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toPublic);
  }

  async create(
    orgId: string,
    projectId: string,
    envId: string,
    data: CreateInput,
  ): Promise<PublicConnection> {
    await this.environments.get(orgId, projectId, envId);

    if (!DATA_SOURCE_TYPES.includes(data.type as DataSourceType)) {
      throw new BadRequestException(
        `Unsupported data source type "${data.type}".`,
      );
    }
    const displayName = (data.displayName ?? "").trim();
    if (!displayName) {
      throw new BadRequestException("displayName is required.");
    }

    // Config must be a plain object — reject arrays/null/scalars before we
    // serialize and encrypt it, so readers always parse back an object.
    const config = data.config ?? {};
    if (typeof config !== "object" || Array.isArray(config)) {
      throw new BadRequestException("config must be an object.");
    }

    const row = await this.prisma.dataSourceConnection.create({
      data: {
        environmentId: envId,
        type: data.type,
        displayName,
        config: this.encryption.encrypt(JSON.stringify(config)),
      },
    });
    return toPublic(row);
  }

  async setEnabled(
    orgId: string,
    projectId: string,
    envId: string,
    id: string,
    enabled: boolean,
  ): Promise<PublicConnection> {
    const row = await this.requireOwned(orgId, projectId, envId, id);
    const updated = await this.prisma.dataSourceConnection.update({
      where: { id: row.id },
      data: { enabled },
    });
    return toPublic(updated);
  }

  async remove(orgId: string, projectId: string, envId: string, id: string) {
    const row = await this.requireOwned(orgId, projectId, envId, id);
    await this.prisma.dataSourceConnection.delete({ where: { id: row.id } });
    return { ok: true };
  }

  /**
   * Decrypted config for the first enabled connection of a type on an env.
   * For source readers only — returns null when absent or undecryptable so
   * callers degrade to their next provider. No org/role check here: the
   * caller is an internal reader, not a user request.
   */
  async getDecryptedConfig(
    envId: string,
    type: DataSourceType,
  ): Promise<Record<string, unknown> | null> {
    const row = await this.prisma.dataSourceConnection.findFirst({
      where: { environmentId: envId, type, enabled: true },
      orderBy: { createdAt: "asc" },
    });
    if (!row) return null;
    try {
      return JSON.parse(this.encryption.decrypt(row.config)) as Record<
        string,
        unknown
      >;
    } catch (err) {
      // Persistent failures here usually mean key rotation or corruption —
      // surface them so they're diagnosable, but still degrade to the next
      // provider rather than failing the whole log fetch.
      this.logger.debug(
        `Failed to decrypt data source ${row.id}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /** Ensure the connection exists and belongs to this env (authz + 404). */
  private async requireOwned(
    orgId: string,
    projectId: string,
    envId: string,
    id: string,
  ) {
    await this.environments.get(orgId, projectId, envId);
    const row = await this.prisma.dataSourceConnection.findFirst({
      where: { id, environmentId: envId },
    });
    if (!row) throw new NotFoundException("Data source not found");
    return row;
  }
}

function toPublic(row: {
  id: string;
  type: string;
  displayName: string;
  enabled: boolean;
  createdAt: Date;
}): PublicConnection {
  return {
    id: row.id,
    type: row.type,
    displayName: row.displayName,
    enabled: row.enabled,
    createdAt: row.createdAt,
  };
}
