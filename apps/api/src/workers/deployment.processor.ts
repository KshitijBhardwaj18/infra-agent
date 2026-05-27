import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { S3Client } from "@aws-sdk/client-s3";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";
import {
  assumeCustomerRole,
  ensureStateBucket,
  buildTemplateContext,
  renderTemplates,
  runPulumiUp,
  exportStack,
} from "@heizen/infra-core";
import type { HeizenConfig, HeizenEnvConfig } from "@heizen/shared";
import { DeploymentsSseService } from "../deployments/deployments-sse.service";
import { EnvVarsService } from "../env-vars/env-vars.service";
import { EventsGateway } from "../websocket/events.gateway";

export interface DeploymentJob {
  deploymentId: string;
  environmentId: string;
  projectId: string;
}

function parseImageUri(imageUri: string): { image: string; tag: string } {
  const lastColon = imageUri.lastIndexOf(":");
  const lastSlash = imageUri.lastIndexOf("/");
  if (lastColon > lastSlash) {
    return {
      image: imageUri.slice(0, lastColon),
      tag: imageUri.slice(lastColon + 1),
    };
  }
  return { image: imageUri, tag: "latest" };
}

@Processor("deployment", { concurrency: 1, stalledInterval: 30_000, maxStalledCount: 2 })
export class DeploymentProcessor extends WorkerHost {
  private readonly logger = new Logger(DeploymentProcessor.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly sse: DeploymentsSseService,
    private readonly envVars: EnvVarsService,
    private readonly gateway: EventsGateway,
  ) {
    super();
  }

  async process(job: Job<DeploymentJob>): Promise<void> {
    return Promise.race([
      this.doProcess(job),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Deployment timed out after 30 minutes")),
          30 * 60 * 1000,
        ),
      ),
    ]);
  }

  private async doProcess(job: Job<DeploymentJob>): Promise<void> {
    const { deploymentId, environmentId, projectId } = job.data;
    const outputDir = path.join(os.tmpdir(), `infra-${deploymentId}`);

    let orgId = "";

    try {
      const [deployment, environment, project] = await Promise.all([
        this.prisma.deployment.findUnique({ where: { id: deploymentId } }),
        this.prisma.environment.findUnique({ where: { id: environmentId } }),
        this.prisma.project.findUnique({ where: { id: projectId } }),
      ]);

      if (!deployment || !environment || !project) {
        throw new Error("Deployment, environment, or project not found");
      }

      if (deployment.status === "CANCELLED") {
        this.logger.log(`Deployment ${deploymentId} was cancelled before processing started — skipping`);
        return;
      }

      orgId = project.organizationId;
      const heizenConfig = environment.heizenConfig as HeizenConfig | null;
      if (!heizenConfig) throw new Error("heizenConfig not set");
      if (!environment.awsRoleArn || !environment.region) {
        throw new Error("AWS configuration missing");
      }

      const imageUri = environment.imageUri;
      if (!imageUri) {
        throw new Error(
          "Docker image URI not configured. Set it in the deploy form.",
        );
      }

      const envType = environment.type === "PRODUCTION" ? "production" : "staging";
      const prefix = `${project.slug}-${envType}`;
      const stateBucket = `heizen-${project.slug}-${envType}-state`;
      const passphrase = process.env.PULUMI_CONFIG_PASSPHRASE ?? "heizen";

      await this.sse.logAndEmit(deploymentId, "SYSTEM", "info", "Assuming AWS role...");
      const awsCreds = await assumeCustomerRole(
        environment.awsRoleArn,
        environmentId,
        environment.region,
      );

      await this.sse.logAndEmit(
        deploymentId,
        "SYSTEM",
        "info",
        "Ensuring Pulumi state bucket...",
      );

      const s3 = new S3Client({
        region: environment.region,
        credentials: awsCreds,
      });
      await ensureStateBucket(s3, stateBucket, environment.region);

      await this.prisma.environment.update({
        where: { id: environmentId },
        data: {
          pulumiBackendBucket: stateBucket,
          pulumiStackName: environment.pulumiStackName ?? prefix,
        },
      });

      environment.pulumiBackendBucket = stateBucket;
      environment.pulumiStackName = environment.pulumiStackName ?? prefix;

      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "DEPLOYING",
          imageUri,
          startedAt: new Date(),
        },
      });
      this.gateway.emitDeploymentStatus(orgId, { deploymentId, status: "DEPLOYING" });

      const { image, tag } = parseImageUri(imageUri);

      const envCfg: HeizenEnvConfig = {
        env: await this.envVars.getDecryptedForDeployment(environmentId),
      };
      const updatedConfig: HeizenConfig = {
        ...heizenConfig,
        env: envType,
        ecr: { image, tag },
      };
      const ctx = buildTemplateContext(updatedConfig, envCfg);
      await renderTemplates(ctx, envType, outputDir);

      const configSecrets: Record<string, string> = {};
      for (const [, vars] of Object.entries(envCfg.env)) {
        for (const [key, value] of Object.entries(vars)) {
          const camelKey = key
            .toLowerCase()
            .replace(/[-_](.)/g, (_, c: string) => (c as string).toUpperCase());
          configSecrets[camelKey] = value;
        }
      }

      const stackName = environment.pulumiStackName ?? prefix;
      const upResult = await runPulumiUp({
        workDir: outputDir,
        stackName,
        backendBucket: environment.pulumiBackendBucket!,
        passphrase,
        awsCreds,
        configSecrets,
        needsDbPassword: updatedConfig.database.engine === "postgres",
        onOutput: (line) => {
          void this.sse.logAndEmit(deploymentId, "PULUMI", "info", line);
        },
      });

      const exported = await exportStack(
        outputDir,
        stackName,
        environment.pulumiBackendBucket!,
        passphrase,
        awsCreds,
      );

      await this.prisma.stackResource.deleteMany({ where: { environmentId } });
      for (const resource of exported.resources) {
        if (!resource.urn || resource.type === "pulumi:pulumi:Stack") continue;
        await this.prisma.stackResource.create({
          data: {
            environmentId,
            pulumiUrn: resource.urn,
            type: resource.type,
            name: (resource as { name?: string }).name ?? resource.type,
            properties: resource as object,
            dependencies: resource.dependencies ?? [],
          },
        });
      }

      const rawOutputs = upResult.outputs as Record<
        string,
        { value: unknown; secret: boolean }
      >;
      const stackOutputs: Record<string, unknown> = {};
      for (const [key, output] of Object.entries(rawOutputs)) {
        stackOutputs[key] =
          output !== null &&
          typeof output === "object" &&
          "value" in output
            ? output.value
            : output;
      }

      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "SUCCESS",
          stackOutputs: stackOutputs as object,
          completedAt: new Date(),
        },
      });

      await this.prisma.environment.update({
        where: { id: environmentId },
        data: {
          status: "LIVE",
          lastDeployedAt: new Date(),
          stackOutputs: stackOutputs as object,
        },
      });

      this.gateway.emitDeploymentStatus(orgId, { deploymentId, status: "SUCCESS" });
      this.gateway.emitEnvironmentStatus(orgId, { environmentId, status: "LIVE" });

      await this.sse.logAndEmit(
        deploymentId,
        "SYSTEM",
        "info",
        "Deployment completed successfully.",
      );
    } catch (error) {
      this.logger.error(`Deployment ${deploymentId} failed`, error);
      const message =
        error instanceof Error ? error.message : String(error);

      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
      });
      await this.prisma.environment.update({
        where: { id: environmentId },
        data: { status: "FAILED" },
      });

      if (orgId) {
        this.gateway.emitDeploymentStatus(orgId, { deploymentId, status: "FAILED" });
        this.gateway.emitEnvironmentStatus(orgId, { environmentId, status: "FAILED" });
      }

      await this.sse.logAndEmit(deploymentId, "SYSTEM", "error", message);
      throw error;
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
      this.sse.cleanup(deploymentId);
    }
  }
}
