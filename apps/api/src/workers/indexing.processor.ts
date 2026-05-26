import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";
import { analyze } from "@heizen/infra-core";
import { GithubTokenService } from "../github/github-token.service";
import { IndexingSseService } from "../github/indexing-sse.service";
import { EventsGateway } from "../websocket/events.gateway";
import type { HeizenConfig } from "@heizen/shared";

export interface IndexingJob {
  projectId: string;
  owner: string;
  repo: string;
  branch: string;
  installationId: string;
  environmentId: string;
}

@Processor("indexing", { concurrency: 5 })
export class IndexingProcessor extends WorkerHost {
  private readonly logger = new Logger(IndexingProcessor.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly githubToken: GithubTokenService,
    private readonly indexingSse: IndexingSseService,
    private readonly gateway: EventsGateway,
  ) {
    super();
  }

  async process(job: Job<IndexingJob>): Promise<void> {
    const { projectId, owner, repo, branch, installationId, environmentId } =
      job.data;

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) return;

    const env = await this.prisma.environment.findUnique({
      where: { id: environmentId },
    });
    const envType = env?.type === "PRODUCTION" ? "production" : "staging";

    try {
      const token = await this.githubToken.getToken(installationId);
      const repoUrl = `https://github.com/${owner}/${repo}.git`;

      const result = await analyze({
        repoUrl,
        token,
        branch,
        projectId,
        projectName: project.slug,
        env: envType,
        onStep: (step, data) => {
          this.indexingSse.emit(projectId, { step: step as "cloning", data });
        },
      });

      await this.prisma.environment.update({
        where: { id: environmentId },
        data: { heizenConfig: JSON.parse(JSON.stringify(result.config)) },
      });

      this.indexingSse.emit(projectId, { step: "complete", data: result.config });

      this.gateway.emitIndexingComplete(project.organizationId, {
        projectId,
        result: result.config as HeizenConfig,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Unknown indexing error";
      this.logger.error(`Indexing failed for project ${projectId}`, message);
      this.indexingSse.emit(projectId, {
        step: "complete",
        data: { error: message },
      });

      this.gateway.emitIndexingComplete(project.organizationId, {
        projectId,
        result: null,
        error: message,
      });

      throw error;
    }
  }
}
