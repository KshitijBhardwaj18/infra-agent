import {
  Injectable,
  Inject,
  NotFoundException,
} from "@nestjs/common";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";
import { EnvironmentsService } from "../environments/environments.service";
import { EventsGateway } from "../websocket/events.gateway";

type Severity = "CRITICAL" | "WARNING" | "INFO";
type Source =
  | "HEALTHCHECK"
  | "AGENT"
  | "MANUAL"
  | "DEPLOYMENT"
  | "LOGS"
  | "METRICS";

export interface IncidentFields {
  severity: Severity;
  source: Source;
  title: string;
  detail?: string | null;
  suggestedRemedy?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * CRUD + lifecycle for incidents. The scanner (ObservabilityService)
 * upserts by fingerprint; the UI/agent can ack/resolve or raise manual
 * incidents.
 */
@Injectable()
export class IncidentsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly environments: EnvironmentsService,
    private readonly gateway: EventsGateway,
  ) {}

  async list(orgId: string, projectId: string, envId: string) {
    await this.environments.get(orgId, projectId, envId);
    return this.prisma.incident.findMany({
      where: { environmentId: envId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  }

  async openCount(envId: string): Promise<number> {
    return this.prisma.incident.count({
      where: { environmentId: envId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    });
  }

  async updateStatus(
    orgId: string,
    projectId: string,
    envId: string,
    incidentId: string,
    status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED",
  ) {
    await this.environments.get(orgId, projectId, envId);
    const inc = await this.prisma.incident.findFirst({
      where: { id: incidentId, environmentId: envId },
    });
    if (!inc) throw new NotFoundException("Incident not found");
    const updated = await this.prisma.incident.update({
      where: { id: incidentId },
      data: {
        status,
        acknowledgedAt:
          status === "ACKNOWLEDGED" ? new Date() : inc.acknowledgedAt,
        resolvedAt: status === "RESOLVED" ? new Date() : null,
      },
    });
    await this.broadcast(orgId, envId);
    return updated;
  }

  /** Raise an incident with no fingerprint (manual / agent-raised). */
  async createManual(
    orgId: string,
    projectId: string,
    envId: string,
    fields: IncidentFields,
  ) {
    await this.environments.get(orgId, projectId, envId);
    const created = await this.prisma.incident.create({
      data: {
        environmentId: envId,
        severity: fields.severity,
        source: fields.source,
        title: fields.title,
        detail: fields.detail ?? null,
        suggestedRemedy: fields.suggestedRemedy ?? null,
        metadata: (fields.metadata ?? undefined) as object | undefined,
      },
    });
    await this.broadcast(orgId, envId);
    return created;
  }

  /** Lookup for the scanner: does this signal already have an incident? */
  async findByFingerprint(envId: string, fingerprint: string) {
    return this.prisma.incident.findUnique({
      where: {
        environmentId_fingerprint: { environmentId: envId, fingerprint },
      },
    });
  }

  /**
   * Scanner entry point: upsert by fingerprint. Creates a new incident,
   * reopens a resolved one if the signal fires again, and leaves an
   * already-open one untouched (so a flapping check doesn't spam).
   */
  async upsertByFingerprint(
    envId: string,
    fingerprint: string,
    fields: IncidentFields,
  ) {
    const existing = await this.prisma.incident.findUnique({
      where: { environmentId_fingerprint: { environmentId: envId, fingerprint } },
    });
    if (existing) {
      if (existing.status === "RESOLVED") {
        return this.prisma.incident.update({
          where: { id: existing.id },
          data: {
            status: "OPEN",
            resolvedAt: null,
            severity: fields.severity,
            title: fields.title,
            detail: fields.detail ?? null,
            suggestedRemedy: fields.suggestedRemedy ?? existing.suggestedRemedy,
            occurrences: { increment: 1 },
            lastSeenAt: new Date(),
          },
        });
      }
      // Still open/ack — refresh the signal's facts (latest error text,
      // severity), count the recurrence, and backfill a remedy — but
      // never reset the human's ack.
      return this.prisma.incident.update({
        where: { id: existing.id },
        data: {
          severity: fields.severity,
          title: fields.title,
          detail: fields.detail ?? existing.detail,
          suggestedRemedy: existing.suggestedRemedy ?? fields.suggestedRemedy,
          metadata: (fields.metadata ?? existing.metadata ?? undefined) as
            | object
            | undefined,
          occurrences: { increment: 1 },
          lastSeenAt: new Date(),
        },
      });
    }
    return this.prisma.incident.create({
      data: {
        environmentId: envId,
        fingerprint,
        severity: fields.severity,
        source: fields.source,
        title: fields.title,
        detail: fields.detail ?? null,
        suggestedRemedy: fields.suggestedRemedy ?? null,
        metadata: (fields.metadata ?? undefined) as object | undefined,
      },
    });
  }

  /** Resolve everything open — used when the env is destroyed. */
  async resolveAllOpen(envId: string) {
    await this.prisma.incident.updateMany({
      where: {
        environmentId: envId,
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
      },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
  }

  /** Resolve open incidents for a fingerprint whose signal has cleared. */
  async resolveByFingerprint(envId: string, fingerprint: string) {
    await this.prisma.incident.updateMany({
      where: {
        environmentId: envId,
        fingerprint,
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
      },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
  }

  /**
   * Resolve open incidents from one source whose fingerprint is no
   * longer in the currently-firing set (alert cleared, error stopped
   * recurring).
   */
  async resolveStaleBySource(
    envId: string,
    source: Source,
    firingFingerprints: Set<string>,
  ) {
    const open = await this.prisma.incident.findMany({
      where: {
        environmentId: envId,
        source,
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
      },
      select: { id: true, fingerprint: true },
    });
    const stale = open.filter(
      (i) => i.fingerprint && !firingFingerprints.has(i.fingerprint),
    );
    if (stale.length > 0) {
      await this.prisma.incident.updateMany({
        where: { id: { in: stale.map((i) => i.id) } },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });
    }
  }

  async broadcast(orgId: string, envId: string) {
    this.gateway.emitIncidentUpdate(orgId, {
      environmentId: envId,
      openCount: await this.openCount(envId),
    });
  }
}
