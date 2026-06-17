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
  runPulumiDestroy,
  exportStack,
  runSsmCommand,
  buildLightsailArtifacts,
  applyImageOverrides,
  getInstallationToken,
  parseComposeYaml,
} from "@heizen/infra-core";
import type {
  HeizenConfig,
  HeizenEnvConfig,
  ParsedCompose,
} from "@heizen/shared";
import { resolveEnvDeploy } from "@heizen/shared";
import { DeploymentsSseService } from "../deployments/deployments-sse.service";
import { EnvVarsService } from "../env-vars/env-vars.service";
import { EventsGateway } from "../websocket/events.gateway";
import { IncidentsService } from "../observability/incidents.service";
import { DataSourcesService } from "../data-sources/data-sources.service";
import { requiredEnv } from "../common/env";

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
    private readonly incidents: IncidentsService,
    private readonly dataSources: DataSourcesService,
  ) {
    super();
  }

  /**
   * Fetches the user's docker-compose.yml from the configured branch,
   * generates the platform-side artifacts (Caddyfile + Caddy sidecar
   * compose + .env), validates routing, and returns the Pulumi config
   * secrets the Lightsail template expects. Each blob is base64-encoded
   * so it embeds cleanly in cloud-init shell heredocs.
   */
  private async buildLightsailConfigSecrets(args: {
    project: { id: string; githubInstallationId: string | null; githubOwner: string | null; githubRepo: string | null; githubBranch: string | null };
    updatedConfig: HeizenConfig;
    envCfg: HeizenEnvConfig;
    environment: { id: string };
    deploymentId: string;
    imageUri: string;
    awsCreds: { accessKeyId: string; secretAccessKey: string; sessionToken: string; region: string };
    lokiToken: string | null;
    lokiPushUrl: string | null;
  }): Promise<Record<string, string>> {
    const { project, updatedConfig, envCfg, environment, deploymentId, imageUri, awsCreds, lokiToken, lokiPushUrl } = args;
    const lokiLogs =
      updatedConfig.observability?.logsDestination === "grafana-loki";

    if (!project.githubInstallationId || !project.githubOwner || !project.githubRepo) {
      throw new Error(
        "Lightsail (staging) deploys require a GitHub repo connection. Connect a repo to this project before deploying.",
      );
    }
    const branch = project.githubBranch ?? "main";

    await this.sse.logAndEmit(
      deploymentId,
      "SYSTEM",
      "info",
      `Fetching docker-compose.yml from ${project.githubOwner}/${project.githubRepo}@${branch}...`,
    );

    const rawComposeYaml = await this.fetchComposeFromGithub(
      project.githubInstallationId,
      project.githubOwner,
      project.githubRepo,
      branch,
    );

    // Inject the ECR images the user picked in the deploy form (per-service
    // image overrides) into the compose before anything reads it, so the
    // parsed view, the shipped compose artifact, and the ECR-login scan all
    // agree on the final image refs. No overrides → identity.
    const composeYaml = applyImageOverrides(
      rawComposeYaml,
      updatedConfig.imageOverrides ?? {},
    );

    const parsedCompose: ParsedCompose = {
      filePath: "docker-compose.yml",
      raw: composeYaml,
      services: parseComposeYaml(composeYaml),
    };

    // Flatten the per-service env map to a single key->value map for
    // the .env file. Conflicts resolve in favor of the last-written
    // value; users put shared values in the "shared" service block to
    // disambiguate.
    const envVars: Record<string, string> = {};
    for (const [, vars] of Object.entries(envCfg.env)) {
      for (const [key, value] of Object.entries(vars)) {
        envVars[key] = value;
      }
    }
    // The Alloy sidecar reads its Loki target + label from these .env vars.
    if (lokiLogs && lokiPushUrl && lokiToken) {
      envVars.LOKI_PUSH_URL = lokiPushUrl;
      envVars.LOKI_TOKEN = lokiToken;
      envVars.HEIZEN_ENV_ID = environment.id;
    }

    const caddyEmail =
      updatedConfig.caddyEmail ??
      process.env.BOOTSTRAP_ADMIN_EMAIL ??
      "admin@heizen.tech";

    const artifacts = buildLightsailArtifacts({
      cfg: updatedConfig,
      composeYaml,
      parsedCompose,
      envVars,
      caddyEmail,
    });

    // Scan ALL compose service image refs for ECR registries — a single
    // deploy can pull from multiple ECR registries (e.g. one for the api
    // image, one for shared base images). The cloud-init script logs
    // into the first one it finds; multi-registry support can come
    // later. The deploy form's imageUri field is ignored on Lightsail
    // (compose is the source of truth for image refs).
    const ECR_RE = /(\d+\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com)\//;
    const ecrRegistries = new Set<string>();
    for (const svc of parsedCompose.services) {
      if (!svc.image) continue;
      const m = ECR_RE.exec(svc.image);
      if (m) ecrRegistries.add(m[1]!);
    }
    // Fall back to the form's imageUri only if the compose had no ECR
    // refs but the user filled the field anyway (e.g. mixed environment
    // where they pre-pull a base image into compose at deploy time).
    if (ecrRegistries.size === 0 && imageUri) {
      const m = ECR_RE.exec(imageUri);
      if (m) ecrRegistries.add(m[1]!);
    }
    const ecrRegistry = ecrRegistries.size > 0 ? [...ecrRegistries][0]! : "";

    const toB64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

    // user_data on Lightsail is capped at 16 KiB. Refuse early if the
    // combined blobs are too big — that's a real failure mode in repos
    // with massive compose files or env blocks.
    const totalSize =
      artifacts.composeYaml.length +
      artifacts.caddyfile.length +
      artifacts.envFile.length +
      artifacts.caddyComposeYaml.length +
      (lokiLogs
        ? artifacts.alloyComposeYaml.length + artifacts.alloyConfigYaml.length
        : 0);
    if (totalSize > 12_000) {
      throw new Error(
        `Combined compose + Caddyfile + .env + caddy-compose is ${totalSize} bytes ` +
          `which after base64 + cloud-init wrapping exceeds Lightsail's 16 KB user_data ` +
          `limit. Reduce env vars or split services.`,
      );
    }

    return {
      composeB64: toB64(artifacts.composeYaml),
      caddyfileB64: toB64(artifacts.caddyfile),
      envFileB64: toB64(artifacts.envFile),
      caddyDockerComposeB64: toB64(artifacts.caddyComposeYaml),
      ...(lokiLogs
        ? {
            alloyDockerComposeB64: toB64(artifacts.alloyComposeYaml),
            alloyConfigB64: toB64(artifacts.alloyConfigYaml),
          }
        : {}),
      ecrRegistry,
      // STS creds — only used if ecrRegistry is set. Lightsail VM does
      // docker login on first boot then discards them.
      ecrAccessKey: ecrRegistry ? awsCreds.accessKeyId : "",
      ecrSecretKey: ecrRegistry ? awsCreds.secretAccessKey : "",
      ecrSessionToken: ecrRegistry ? awsCreds.sessionToken : "",
    };
  }

  /**
   * EC2 variant of the compose-artifacts builder. Same compose fetch +
   * artifact generation as Lightsail, but: no ECR creds (the box's IAM
   * instance role handles ECR), and no 16 KB size guard (files are
   * delivered via S3, not user_data). The .env here is the RAW user env;
   * the ec2 template injects DATABASE_URL / AWS_S3_BUCKET from the
   * managed RDS/S3 resources at apply time. dbPassword is auto-generated
   * by runPulumiUp (needsDbPassword) and persisted in the stack config.
   */
  private async buildEc2ConfigSecrets(args: {
    project: { githubInstallationId: string | null; githubOwner: string | null; githubRepo: string | null; githubBranch: string | null };
    updatedConfig: HeizenConfig;
    envCfg: HeizenEnvConfig;
    deploymentId: string;
    envId: string;
    lokiToken: string | null;
    lokiPushUrl: string | null;
  }): Promise<Record<string, string>> {
    const { project, updatedConfig, envCfg, deploymentId, envId, lokiToken, lokiPushUrl } = args;
    const lokiLogs =
      updatedConfig.observability?.logsDestination === "grafana-loki";

    if (!project.githubInstallationId || !project.githubOwner || !project.githubRepo) {
      throw new Error(
        "EC2 deploys require a GitHub repo connection. Connect a repo to this project before deploying.",
      );
    }
    const branch = project.githubBranch ?? "main";

    await this.sse.logAndEmit(
      deploymentId,
      "SYSTEM",
      "info",
      `Fetching docker-compose.yml from ${project.githubOwner}/${project.githubRepo}@${branch}...`,
    );

    const rawComposeYaml = await this.fetchComposeFromGithub(
      project.githubInstallationId,
      project.githubOwner,
      project.githubRepo,
      branch,
    );
    // Same per-service ECR image injection as the Lightsail path — applied
    // before parsing so the compose artifact shipped to the EC2 box carries
    // the chosen image refs. No overrides → identity.
    const composeYaml = applyImageOverrides(
      rawComposeYaml,
      updatedConfig.imageOverrides ?? {},
    );
    const parsedCompose: ParsedCompose = {
      filePath: "docker-compose.yml",
      raw: composeYaml,
      services: parseComposeYaml(composeYaml),
    };

    const envVars: Record<string, string> = {};
    for (const [, vars] of Object.entries(envCfg.env)) {
      for (const [key, value] of Object.entries(vars)) {
        envVars[key] = value;
      }
    }
    // The Alloy sidecar reads its Loki target + label from these .env vars.
    if (lokiLogs && lokiPushUrl && lokiToken) {
      envVars.LOKI_PUSH_URL = lokiPushUrl;
      envVars.LOKI_TOKEN = lokiToken;
      envVars.HEIZEN_ENV_ID = envId;
    }

    const caddyEmail =
      updatedConfig.caddyEmail ??
      process.env.BOOTSTRAP_ADMIN_EMAIL ??
      "admin@heizen.tech";

    const artifacts = buildLightsailArtifacts({
      cfg: updatedConfig,
      composeYaml,
      parsedCompose,
      envVars,
      caddyEmail,
    });

    const toB64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
    return {
      composeB64: toB64(artifacts.composeYaml),
      caddyfileB64: toB64(artifacts.caddyfile),
      envFileB64: toB64(artifacts.envFile),
      caddyDockerComposeB64: toB64(artifacts.caddyComposeYaml),
      ...(lokiLogs
        ? {
            alloyDockerComposeB64: toB64(artifacts.alloyComposeYaml),
            alloyConfigB64: toB64(artifacts.alloyConfigYaml),
          }
        : {}),
    };
  }

  /**
   * Pulls a file from a GitHub repo via the contents API using the
   * GitHub App installation token. Branch is required so we always
   * deploy what's actually at HEAD of the configured branch, not what
   * the indexer cached at some earlier time.
   */
  private async fetchComposeFromGithub(
    installationId: string,
    owner: string,
    repo: string,
    branch: string,
  ): Promise<string> {
    const token = await getInstallationToken(installationId);
    const candidates = [
      "docker-compose.yml",
      "docker-compose.yaml",
      "compose.yml",
      "compose.yaml",
    ];
    for (const file of candidates) {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${file}?ref=${encodeURIComponent(branch)}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.raw",
        },
      });
      if (res.status === 404) continue;
      if (!res.ok) {
        throw new Error(
          `GitHub returned ${res.status} fetching ${file} from ${owner}/${repo}@${branch}.`,
        );
      }
      return await res.text();
    }
    throw new Error(
      `No docker-compose.yml found at the root of ${owner}/${repo}@${branch}. The Lightsail template requires one — add a compose file at the repo root.`,
    );
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

      const imageUri = environment.imageUri ?? "";
      // `envSlug` drives prefix/bucket naming + the heizenConfig.env
      // field (production/staging) — unchanged by deploy strategy.
      // `templateKey` selects which Pulumi template to render and is
      // decoupled from env type via deployStrategy: an EC2 production
      // env renders the `ec2` template but is still named/scoped as
      // "production". Null strategy infers from type for back-compat.
      // Single source of truth for how this env deploys. For the
      // auto-scaffolded STAGING/PRODUCTION envs this returns the same
      // slug/strategy/templateKey the inline inference produced before.
      const resolved = resolveEnvDeploy(environment);
      const envSlug = resolved.slug;
      const deployStrategy = resolved.deployStrategy;
      const templateKey: "production" | "staging" | "ec2" =
        resolved.templateKey;
      // Only the ECS template bakes the image into the task definition.
      // Compose-based templates (staging/ec2) read image refs from
      // docker-compose.yml, so the form field is optional there.
      if (templateKey === "production" && !imageUri) {
        throw new Error(
          "Docker image URI not configured. Set it in the deploy form.",
        );
      }

      const prefix = `${project.slug}-${envSlug}`;
      const stateBucket = `heizen-${project.slug}-${envSlug}-state`;
      const passphrase = requiredEnv("PULUMI_CONFIG_PASSPHRASE");

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
        // The generator's preset mode keys off the tier (staging/production),
        // not the URL slug — so a custom env still picks the right presets.
        // For legacy rows with no explicit tier, resolveEnvDeploy derives it
        // from `type` (back-compat), matching the previous inline behavior.
        env: resolved.envType,
        ecr: { image, tag },
      };

      // Defense-in-depth: the project slug is interpolated into shell
      // commands (the EC2 SSM sync below + the cloud-init APP_DIR path in
      // the VM templates). Reject anything that isn't a plain slug so a
      // crafted project name can't break out of the command. Slugs are
      // validated at creation, but the cost of asserting here is nil.
      if (!/^[a-z0-9][a-z0-9-]*$/.test(updatedConfig.project)) {
        throw new Error(
          `Unsafe project slug "${updatedConfig.project}" — expected lowercase alphanumerics and hyphens only.`,
        );
      }

      const ctx = buildTemplateContext(updatedConfig, envCfg, {
        ec2InstanceType: environment.ec2InstanceType ?? undefined,
        envId: environment.id,
        // Unique per env → distinct Pulumi resource names for custom envs.
        // For staging/production this equals cfg.env, so the render is unchanged.
        envSlug: resolved.slug,
      });
      await renderTemplates(ctx, templateKey, outputDir);

      // Diagnostic: surface whether node_modules actually has @pulumi/pulumi
      // after renderTemplates returns. Catches the silent "symlink to
      // nowhere" failure mode that prints "Pulumi SDK has not been
      // installed" from Pulumi's vague top-level error handler.
      try {
        const nm = path.join(outputDir, "node_modules", "@pulumi", "pulumi");
        const stat = await fs.stat(nm);
        await this.sse.logAndEmit(
          deploymentId,
          "SYSTEM",
          "info",
          `Pulumi deps OK: ${nm} (${stat.isDirectory() ? "dir" : "not dir"})`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await this.sse.logAndEmit(
          deploymentId,
          "SYSTEM",
          "error",
          `Pulumi deps MISSING after renderTemplates: ${msg}. PULUMI_BASE_DEPS_DIR=${process.env.PULUMI_BASE_DEPS_DIR ?? "<unset>"}`,
        );
      }

      // Build Pulumi config secrets — the shape differs per template.
      //
      // ECS template: every env var becomes its own Pulumi config secret,
      // referenced as cfg.requireSecret("camelCaseKey") in the rendered
      // index.ts.
      //
      // Lightsail template: the user's compose, our Caddyfile, the env
      // file, and (optionally) ECR creds — all base64-encoded — go in
      // as a fixed set of 4 + 4 keys. The instance's cloud-init decodes
      // and writes them at boot.
      // Resolve the Loki shipping target when this env opted into it. The
      // push URL + token come from the connected grafana-loki source; fail
      // fast (before pulumi) if the choice was made but nothing is wired.
      const lokiLogs =
        updatedConfig.observability?.logsDestination === "grafana-loki";
      let lokiToken: string | null = null;
      let lokiPushUrl: string | null = null;
      if (lokiLogs) {
        const conn = await this.dataSources.getDecryptedConfig(
          environment.id,
          "grafana-loki",
        );
        if (!conn) {
          throw new Error(
            "Logs destination is Grafana/Loki, but no Grafana/Loki source is connected. Connect one in Settings → Observability.",
          );
        }
        lokiPushUrl = typeof conn.pushUrl === "string" ? conn.pushUrl : null;
        lokiToken = typeof conn.token === "string" ? conn.token : null;
        if (!lokiPushUrl || !lokiToken) {
          throw new Error(
            "The connected Grafana/Loki source is missing a Loki push URL or token. Add them in Settings → Observability.",
          );
        }
      }

      let configSecrets: Record<string, string>;
      if (templateKey === "staging") {
        configSecrets = await this.buildLightsailConfigSecrets({
          project,
          updatedConfig,
          envCfg,
          environment,
          deploymentId,
          imageUri,
          awsCreds,
          lokiToken,
          lokiPushUrl,
        });
      } else if (templateKey === "ec2") {
        configSecrets = await this.buildEc2ConfigSecrets({
          project,
          updatedConfig,
          envCfg,
          deploymentId,
          envId: environment.id,
          lokiToken,
          lokiPushUrl,
        });
      } else {
        configSecrets = {};
        for (const [, vars] of Object.entries(envCfg.env)) {
          for (const [key, value] of Object.entries(vars)) {
            const camelKey = key
              .toLowerCase()
              .replace(/[-_](.)/g, (_, c: string) => (c as string).toUpperCase());
            configSecrets[camelKey] = value;
          }
        }
        if (lokiLogs && lokiToken && lokiPushUrl) {
          configSecrets.lokiToken = lokiToken;
          configSecrets.lokiPushUrl = lokiPushUrl;
        }
      }

      const stackName = environment.pulumiStackName ?? prefix;
      const isDestroy = deployment.kind === "DESTROY";

      if (isDestroy) {
        await this.sse.logAndEmit(
          deploymentId,
          "SYSTEM",
          "info",
          "Running pulumi destroy...",
        );

        await runPulumiDestroy({
          workDir: outputDir,
          stackName,
          backendBucket: environment.pulumiBackendBucket!,
          passphrase,
          awsCreds,
          configSecrets,
          removeStack: true,
          onOutput: (line) => {
            void this.sse.logAndEmit(deploymentId, "PULUMI", "info", line);
          },
        });

        // Tombstone the env: clear stack metadata + cached resources so
        // a future deploy starts from scratch (new bucket layout, new
        // stack name on first up). Keep heizenConfig / awsRoleArn so
        // the user doesn't lose their wiring.
        await this.prisma.stackResource.deleteMany({ where: { environmentId } });

        await this.prisma.deployment.update({
          where: { id: deploymentId },
          data: {
            status: "SUCCESS",
            completedAt: new Date(),
            stackOutputs: {} as object,
          },
        });

        await this.prisma.environment.update({
          where: { id: environmentId },
          data: {
            status: "DESTROYED",
            stackOutputs: {} as object,
            pulumiBackendBucket: null,
            pulumiStackName: null,
            lastDeployedAt: null,
          },
        });

        this.gateway.emitDeploymentStatus(orgId, { deploymentId, status: "SUCCESS" });
        this.gateway.emitEnvironmentStatus(orgId, { environmentId, status: "DESTROYED" });

        // The env is gone — any open incident on it is noise now.
        await this.incidents
          .resolveAllOpen(environmentId)
          .then(() => this.incidents.broadcast(orgId, environmentId))
          .catch(() => {});

        await this.sse.logAndEmit(
          deploymentId,
          "SYSTEM",
          "info",
          "Destroy completed successfully. All AWS resources removed.",
        );
        return;
      }

      // ── DEPLOY path ────────────────────────────────────────────────
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

      // EC2 in-place update. On a REDEPLOY (the box already existed and
      // wasn't replaced — userData/ami are ignoreChanges), cloud-init
      // does NOT re-run, so we sync the freshly-updated S3 bundle onto
      // the box and restart compose via SSM. On a FIRST deploy the
      // instance's own cloud-init does this, so we skip.
      if (templateKey === "ec2") {
        const priorOutputs = environment.stackOutputs as Record<
          string,
          unknown
        > | null;
        const priorInstanceId =
          typeof priorOutputs?.instanceId === "string"
            ? priorOutputs.instanceId
            : null;
        const newInstanceId =
          typeof stackOutputs.instanceId === "string"
            ? stackOutputs.instanceId
            : null;
        const artifactsBucket =
          typeof stackOutputs.artifactsBucketName === "string"
            ? stackOutputs.artifactsBucketName
            : null;

        if (
          priorInstanceId &&
          newInstanceId &&
          priorInstanceId === newInstanceId &&
          artifactsBucket
        ) {
          await this.sse.logAndEmit(
            deploymentId,
            "SYSTEM",
            "info",
            "Syncing updated config to the running instance via SSM...",
          );
          // Re-assert the slug is shell-safe right at the interpolation
          // site (also guarded up-front after updatedConfig is built).
          // The project name is interpolated into the shell commands below.
          if (!/^[a-z0-9][a-z0-9-]*$/.test(updatedConfig.project)) {
            throw new Error(
              `Unsafe project slug "${updatedConfig.project}" for SSM command.`,
            );
          }
          const appDir = `/home/ubuntu/${updatedConfig.project}`;
          const region = environment.region!;
          const compose = `docker compose -f docker-compose.yml -f docker-compose.caddy.yml ${lokiLogs ? "-f docker-compose.alloy.yml " : ""}--env-file .env`;
          await runSsmCommand({
            instanceId: newInstanceId,
            awsCreds,
            commands: [
              "set -e",
              `cd ${appDir}`,
              `aws s3 sync s3://${artifactsBucket}/current/ ${appDir}/ --region ${region}`,
              `[ -f ${appDir}/.env ] && chmod 600 ${appDir}/.env || true`,
              `aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin "$(aws sts get-caller-identity --query Account --output text).dkr.ecr.${region}.amazonaws.com" || true`,
              `${compose} pull`,
              `${compose} up -d --remove-orphans`,
            ],
            onOutput: (line) =>
              void this.sse.logAndEmit(deploymentId, "SYSTEM", "info", line),
          });
        }
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

      // A successful deploy clears any standing deploy-failure incident.
      await this.incidents
        .resolveByFingerprint(environmentId, "deployment-failure")
        .then(() => this.incidents.broadcast(orgId, environmentId))
        .catch(() => {});

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

      // Raise (or refresh) the standing deploy-failure incident so the
      // observability layer tracks it. One fingerprint per env: repeated
      // failures update it, the next successful deploy resolves it.
      // Never let incident bookkeeping mask the real deploy error.
      try {
        await this.incidents.upsertByFingerprint(
          environmentId,
          "deployment-failure",
          {
            severity: "CRITICAL",
            source: "DEPLOYMENT",
            title: "Deployment failed",
            detail: message,
            metadata: { deploymentId },
          },
        );
        if (orgId) await this.incidents.broadcast(orgId, environmentId);
      } catch (incidentErr) {
        this.logger.warn(
          `Failed to raise deploy-failure incident for env ${environmentId}: ${(incidentErr as Error).message}`,
        );
      }

      await this.sse.logAndEmit(deploymentId, "SYSTEM", "error", message);
      throw error;
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
      this.sse.cleanup(deploymentId);
    }
  }
}
