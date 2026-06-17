import { Processor, WorkerHost, InjectQueue } from "@nestjs/bullmq";
import { Inject, Logger, OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import type { Job } from "bullmq";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";
import { ObservabilityService } from "./observability.service";
import { env as readEnv } from "../common/env";

export const MONITORING_QUEUE = "monitoring";

/**
 * Continuous monitoring: a repeatable job sweeps every LIVE environment
 * and runs the same scan the "Scan now" button triggers (HTTP probe +
 * container health + Grafana). Incidents open/auto-resolve as signals
 * come and go; remedies are only generated for NEW incidents, so a
 * standing failure costs one LLM call total, not one per sweep.
 *
 * Cadence: MONITOR_INTERVAL_MIN (default 5). Set 0 to disable.
 */
@Processor(MONITORING_QUEUE)
export class MonitoringProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(MonitoringProcessor.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @InjectQueue(MONITORING_QUEUE) private readonly queue: Queue,
    private readonly observability: ObservabilityService,
  ) {
    super();
  }

  async onModuleInit() {
    const raw = readEnv("MONITOR_INTERVAL_MIN");
    const minutes = raw === undefined || raw === "" ? 5 : Number(raw);

    if (!Number.isFinite(minutes) || minutes <= 0) {
      await this.queue
        .removeJobScheduler("env-sweep")
        .catch(() => {});
      this.logger.log("Continuous monitoring disabled (MONITOR_INTERVAL_MIN=0)");
      return;
    }

    await this.queue.upsertJobScheduler(
      "env-sweep",
      { every: minutes * 60_000 },
      { name: "env-sweep", data: {} },
    );
    this.logger.log(`Continuous monitoring: sweeping LIVE envs every ${minutes}m`);
  }

  async process(_job: Job): Promise<void> {
    const envs = await this.prisma.environment.findMany({
      where: { status: "LIVE" },
      select: {
        id: true,
        projectId: true,
        project: { select: { organizationId: true } },
      },
    });

    for (const env of envs) {
      try {
        await this.observability.scan(
          env.project.organizationId,
          env.projectId,
          env.id,
        );
      } catch (err) {
        // One broken env must not stop the sweep.
        this.logger.warn(
          `Monitor scan failed for env ${env.id}: ${(err as Error).message}`,
        );
      }
    }
  }
}
