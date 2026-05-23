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
  runSetupStack,
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

@Processor("deployment", { concurrency: 1 })
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
      const codebuildProjectName = `heizen-${project.slug}-${envType}`;
      const passphrase = process.env.PULUMI_CONFIG_PASSPHRASE ?? "heizen";

      // ── 1. Assume customer AWS role ──────────────────────────────────────
      await this.sse.logAndEmit(deploymentId, "SYSTEM", "info", "Assuming AWS role...");
      const awsCreds = await assumeCustomerRole(
        environment.awsRoleArn,
        environmentId,
        environment.region,
      );

      // ── 2. Ensure build infrastructure (idempotent Pulumi setup stack) ───
      await this.sse.logAndEmit(
        deploymentId,
        "SYSTEM",
        "info",
        "Ensuring build infrastructure...",
      );

      const s3 = new S3Client({
        region: environment.region,
        credentials: awsCreds,
      });
      await ensureStateBucket(s3, stateBucket, environment.region);

      const setup = await runSetupStack({
        stackName: `${prefix}-setup`,
        backendBucket: stateBucket,
        passphrase,
        region: environment.region,
        awsCreds,
        ecrRepoName,
        roleName,
        projectName: codebuildProjectName,
        onOutput: (line) => {
          void this.sse.logAndEmit(deploymentId, "SYSTEM", "info", line);
        },
      });

      await this.prisma.environment.update({
        where: { id: environmentId },
        data: {
          ecrUri: setup.ecrUri,
          codebuildProjectName: setup.codebuildProjectName,
          pulumiBackendBucket: stateBucket,
          pulumiStackName: environment.pulumiStackName ?? prefix,
          setupComplete: true,
        },
      });

      environment.ecrUri = setup.ecrUri;
      environment.codebuildProjectName = setup.codebuildProjectName;
      environment.pulumiBackendBucket = stateBucket;
      environment.pulumiStackName = environment.pulumiStackName ?? prefix;
      environment.setupComplete = true;

      if (!environment.pulumiBackendBucket) {
        throw new Error(
          "Pulumi backend bucket not set. Reset setupComplete=false to re-run setup.",
        );
      }
      if (!environment.codebuildProjectName) {
        throw new Error(
          "CodeBuild project name not set. Reset setupComplete=false to re-run setup.",
        );
      }
      if (!environment.ecrUri) {
        throw new Error(
          "ECR URI not set. Reset setupComplete=false to re-run setup.",
        );
      }

      // ── 3. Update status → BUILDING ──────────────────────────────────────
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: "BUILDING", startedAt: new Date() },
      });
      this.gateway.emitDeploymentStatus(orgId, { deploymentId, status: "BUILDING" });

      // ── 4. Fresh GitHub installation token (1hr TTL) ─────────────────────
      if (!project.githubInstallationId) throw new Error("GitHub not connected");
      const ghToken = await this.githubToken.getToken(project.githubInstallationId);

      // ── 5. Docker build + push via CodeBuild ─────────────────────────────
      const commitSha = deployment.commitSha ?? null;
      const imageTag = commitSha
        ? commitSha.slice(0, 7)
        : `deploy-${Date.now()}`;
      const accountId =
        environment.awsAccountId ??
        environment.ecrUri?.split(".")[0] ??
        "";
      const ecrRegistry = `${accountId}.dkr.ecr.${environment.region}.amazonaws.com`;

      await startBuildAndStream({
        projectName: environment.codebuildProjectName!,
        region: environment.region,
        awsCreds,
        envOverrides: {
          GITHUB_TOKEN: ghToken,
          GITHUB_OWNER: project.githubOwner!,
          GITHUB_REPO: project.githubRepo!,
          COMMIT_SHA: commitSha ?? "HEAD",
          ECR_REGISTRY: ecrRegistry,
          ECR_REPO: ecrRepoName,
          IMAGE_TAG: imageTag,
          DOCKERFILE_PATH: heizenConfig.dockerfilePath ?? "Dockerfile",
          CODEBUILD_PROJECT_NAME: environment.codebuildProjectName!,
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
          void this.sse.logAndEmit(
            deploymentId,
            phase as "DOCKER_BUILD",
            level,
            message,
          );
        },
      });

      // ── 6. Update status → DEPLOYING ─────────────────────────────────────
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: "DEPLOYING", imageTag, ecrUri: environment.ecrUri },
      });
      this.gateway.emitDeploymentStatus(orgId, { deploymentId, status: "DEPLOYING" });

      // ── 7. Generate Pulumi infrastructure code from Handlebars templates ──
      const envCfg: HeizenEnvConfig = {
        env: await this.envVars.getDecryptedForDeployment(environmentId),
      };
      const updatedConfig: HeizenConfig = {
        ...heizenConfig,
        env: envType,
        ecr: {
          image: environment.ecrUri!.split(":")[0] ?? environment.ecrUri!,
          tag: imageTag,
        },
      };
      const ctx = buildTemplateContext(updatedConfig, envCfg);
      await renderTemplates(ctx, envType, outputDir);

      // ── 8. Pulumi up — deploy the actual infrastructure ───────────────────
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

      if (!environment.pulumiStackName) {
        await this.prisma.environment.update({
          where: { id: environmentId },
          data: { pulumiStackName: stackName },
        });
      }

      // ── 9. Export stack state → save resources for the resource graph ─────
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

      // ── 10. Extract plain values from Pulumi's OutputValue wrapper ─────────
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

      // ── 11. Mark SUCCESS / LIVE ──────────────────────────────────────────
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "SUCCESS",
          stackOutputs,
          completedAt: new Date(),
        },
      });

      await this.prisma.environment.update({
        where: { id: environmentId },
        data: {
          status: "LIVE",
          lastDeployedAt: new Date(),
          stackOutputs,
        },
      });

      // ── 12. WebSocket events → browser updates ───────────────────────────
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
