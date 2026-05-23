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
  ensureCodeBuildProject,
  startBuildAndStream,
  buildTemplateContext,
  renderTemplates,
  runPulumiUp,
  exportStack,
} from "@heizen/infra-core";
import type { HeizenConfig, HeizenEnvConfig } from "@heizen/shared";
import { GithubTokenService } from "../github/github-token.service";
import { DeploymentsSseService } from "../deployments/deployments-sse.service";
import { EnvVarsService } from "../env-vars/env-vars.service";
import { EventsGateway } from "../websocket/events.gateway";

export interface DeploymentJob {
  deploymentId: string;
  environmentId: string;
  projectId: string;
}

@Processor("deployment", { concurrency: 2 })
export class DeploymentProcessor extends WorkerHost {
  private readonly logger = new Logger(DeploymentProcessor.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly githubToken: GithubTokenService,
    private readonly sse: DeploymentsSseService,
    private readonly envVars: EnvVarsService,
    private readonly gateway: EventsGateway,
  ) {
    super();
  }

  async process(job: Job<DeploymentJob>): Promise<void> {
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

      orgId = project.organizationId;
      const heizenConfig = environment.heizenConfig as HeizenConfig | null;
      if (!heizenConfig) throw new Error("heizenConfig not set");
      if (!environment.awsRoleArn || !environment.region) {
        throw new Error("AWS configuration missing");
      }

      const envType = environment.type === "PRODUCTION" ? "production" : "staging";
      const prefix = `${project.slug}-${envType}`;
      const stateBucket = `heizen-${project.slug}-${envType}-state`;
      const ecrRepoName = `heizen-${project.slug}-${envType}`;
      const roleName = `heizen-${project.slug}-${envType}-codebuild-role`;
      const codebuildProjectName =
        environment.codebuildProjectName ?? `heizen-${project.slug}-${envType}`;

      // 1. Assume customer AWS role
      await this.sse.logAndEmit(deploymentId, "SYSTEM", "info", "Assuming AWS role...");
      const awsCreds = await assumeCustomerRole(
        environment.awsRoleArn,
        environmentId,
        environment.region,
      );

      // 2. First-time setup (Pulumi state bucket)
      if (!environment.setupComplete) {
        await this.sse.logAndEmit(deploymentId, "SYSTEM", "info", "Running first-time infrastructure setup...");

        const s3 = new S3Client({
          region: environment.region,
          credentials: awsCreds,
        });
        await ensureStateBucket(s3, stateBucket, environment.region);
      }

      // 3. Ensure CodeBuild project + ECR exist (idempotent, runs every deploy)
      await this.sse.logAndEmit(deploymentId, "SYSTEM", "info", "Ensuring CodeBuild project...");
      const setup = await ensureCodeBuildProject({
        projectName: codebuildProjectName,
        ecrRepoName,
        roleName,
        region: environment.region,
        awsCreds,
      });

      if (
        !environment.setupComplete ||
        environment.ecrUri !== setup.ecrUri ||
        environment.codebuildProjectName !== setup.codebuildProjectName
      ) {
        await this.prisma.environment.update({
          where: { id: environmentId },
          data: {
            ecrUri: setup.ecrUri,
            codebuildProjectName: setup.codebuildProjectName,
            pulumiBackendBucket: environment.pulumiBackendBucket ?? stateBucket,
            pulumiStackName: environment.pulumiStackName ?? prefix,
            setupComplete: true,
          },
        });

        environment.ecrUri = setup.ecrUri;
        environment.codebuildProjectName = setup.codebuildProjectName;
        environment.pulumiBackendBucket = environment.pulumiBackendBucket ?? stateBucket;
        environment.pulumiStackName = environment.pulumiStackName ?? prefix;
        environment.setupComplete = true;
      }

      const accountId =
        environment.awsAccountId ??
        environment.ecrUri?.split(".")[0] ??
        "";
      const ecrRegistry = `${accountId}.dkr.ecr.${environment.region!}.amazonaws.com`;
      const ecrRepo = `heizen-${project.slug}-${envType}`;

      // 3. Update status → BUILDING
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: "BUILDING", startedAt: new Date() },
      });
      this.gateway.emitDeploymentStatus(orgId, { deploymentId, status: "BUILDING" });

      // 4. Fresh GitHub token
      if (!project.githubInstallationId) throw new Error("GitHub not connected");
      const ghToken = await this.githubToken.getToken(project.githubInstallationId);

      // 5. Start CodeBuild
      const commitSha = deployment.commitSha ?? "HEAD";
      const imageTag = commitSha.slice(0, 7);

      await startBuildAndStream({
        projectName: environment.codebuildProjectName ?? codebuildProjectName,
        region: environment.region,
        awsCreds,
        envOverrides: {
          GITHUB_TOKEN: ghToken,
          GITHUB_OWNER: project.githubOwner!,
          GITHUB_REPO: project.githubRepo!,
          COMMIT_SHA: commitSha,
          ECR_REGISTRY: ecrRegistry,
          ECR_REPO: ecrRepo,
          IMAGE_TAG: imageTag,
          DOCKERFILE_PATH: heizenConfig.dockerfilePath ?? "Dockerfile",
          CODEBUILD_PROJECT_NAME: environment.codebuildProjectName ?? codebuildProjectName,
        },
        onLog: (message, level) => {
          const lower = message.toLowerCase();
          const phase =
            lower.startsWith("docker push") ||
            message.includes("The push refers to") ||
            message.includes("digest: sha256") ||
            message.includes("Pushed")
              ? "DOCKER_PUSH"
              : "DOCKER_BUILD";
          void this.sse.logAndEmit(deploymentId, phase as "DOCKER_BUILD", level, message);
        },
      });

      // 7. Update status → DEPLOYING
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: "DEPLOYING", imageTag, ecrUri: environment.ecrUri },
      });
      this.gateway.emitDeploymentStatus(orgId, { deploymentId, status: "DEPLOYING" });

      // 8. Generate Pulumi code
      const envCfg: HeizenEnvConfig = { env: await this.envVars.getDecryptedForDeployment(environmentId) };
      const updatedConfig: HeizenConfig = {
        ...heizenConfig,
        env: envType,
        ecr: { image: environment.ecrUri!.split(":")[0] ?? environment.ecrUri!, tag: imageTag },
      };
      const ctx = buildTemplateContext(updatedConfig, envCfg);
      await renderTemplates(ctx, envType, outputDir);

      // 9. Pulumi up
      const configSecrets: Record<string, string> = {};
      for (const [service, vars] of Object.entries(envCfg.env)) {
        for (const [key, value] of Object.entries(vars)) {
          const camelKey = key.toLowerCase().replace(/[-_](.)/g, (_, c: string) => c.toUpperCase());
          configSecrets[camelKey] = value;
        }
      }

      const stackName = environment.pulumiStackName ?? prefix;

      const upResult = await runPulumiUp({
        workDir: outputDir,
        stackName,
        backendBucket: environment.pulumiBackendBucket!,
        passphrase: process.env.PULUMI_CONFIG_PASSPHRASE ?? "heizen",
        awsCreds,
        configSecrets,
        needsDbPassword: updatedConfig.database.engine === "postgres",
        onOutput: (line) => {
          void this.sse.logAndEmit(deploymentId, "PULUMI", "info", line);
        },
      });

      if (!environment.pulumiStackName) {
        await this.prisma.environment.update({
          where: { id: environmentId },
          data: { pulumiStackName: stackName },
        });
      }

      // 10-11. Parse outputs and export stack
      const exported = await exportStack(
        outputDir,
        stackName,
        environment.pulumiBackendBucket!,
        process.env.PULUMI_CONFIG_PASSPHRASE ?? "heizen",
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

      // 12-13. Mark SUCCESS / LIVE
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "SUCCESS",
          stackOutputs: upResult.outputs as object,
          completedAt: new Date(),
        },
      });

      await this.prisma.environment.update({
        where: { id: environmentId },
        data: {
          status: "LIVE",
          lastDeployedAt: new Date(),
          stackOutputs: upResult.outputs as object,
        },
      });

      // 14. WebSocket events
      this.gateway.emitDeploymentStatus(orgId, { deploymentId, status: "SUCCESS" });
      this.gateway.emitEnvironmentStatus(orgId, { environmentId, status: "LIVE" });

      await this.sse.logAndEmit(deploymentId, "SYSTEM", "info", "Deployment completed successfully");
    } catch (error) {
      this.logger.error(`Deployment ${deploymentId} failed`, error);
      const message = error instanceof Error ? error.message : String(error);

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
