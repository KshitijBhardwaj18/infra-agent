import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import type { PrismaClient } from "@heizen/db";
import {
  deployStrategySchema,
  isAwsRegion,
  isLightsailRegion,
  resolveEnvDeploy,
  LIGHTSAIL_REGIONS,
  type DeployStrategy,
} from "@heizen/shared";

/** Lowercase, hyphenate, strip junk → a safe URL/Pulumi slug. */
function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Slugs reserved for the two auto-scaffolded tiers.
const RESERVED_SLUGS = new Set(["staging", "production"]);
// An env with resources (or mid-operation) must be torn down before delete.
const DELETABLE_STATUSES = new Set(["NOT_DEPLOYED", "DESTROYED"]);
import { PRISMA } from "../prisma/prisma.module";
import { ProjectsService } from "../projects/projects.service";
import { assumeCustomerRole, accountIdFromRoleArn } from "@heizen/infra-core";
import {
  ECRClient,
  DescribeRepositoriesCommand,
  ListImagesCommand,
} from "@aws-sdk/client-ecr";

@Injectable()
export class EnvironmentsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly projects: ProjectsService,
  ) {}

  /**
   * Creates an additional (CUSTOM) environment with its own display name,
   * URL slug, deploy template, and tier. The two STAGING/PRODUCTION envs are
   * auto-scaffolded at project creation; this endpoint adds extras on top.
   */
  async create(
    orgId: string,
    projectId: string,
    input: {
      name: string;
      slug?: string;
      deployStrategy: DeployStrategy;
      tier?: "STAGING" | "PRODUCTION";
    },
  ) {
    await this.projects.get(orgId, projectId);

    const name = input.name?.trim();
    if (!name) throw new BadRequestException("Environment name is required");

    if (!deployStrategySchema.safeParse(input.deployStrategy).success) {
      throw new BadRequestException(
        `Invalid deployStrategy "${input.deployStrategy}"`,
      );
    }

    const slug = slugify(input.slug?.trim() || name);
    // slugify can return "" for input with no alphanumerics (e.g. "___").
    if (!slug) {
      throw new BadRequestException(
        "Environment name (or slug) must contain at least one letter or number",
      );
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      throw new BadRequestException(
        "Slug must be lowercase letters, numbers, and hyphens",
      );
    }
    if (RESERVED_SLUGS.has(slug)) {
      throw new BadRequestException(`"${slug}" is a reserved environment slug`);
    }
    const clash = await this.prisma.environment.findFirst({
      where: { projectId, slug },
    });
    if (clash) {
      throw new BadRequestException(
        `An environment with slug "${slug}" already exists in this project`,
      );
    }

    // Tier is chosen independently of the template, defaulting from it.
    const tier =
      input.tier ??
      (input.deployStrategy === "LIGHTSAIL" ? "STAGING" : "PRODUCTION");

    return this.prisma.environment.create({
      data: {
        projectId,
        type: "CUSTOM",
        name,
        slug,
        tier,
        deployStrategy: input.deployStrategy,
      },
    });
  }

  /**
   * Deletes a CUSTOM environment. The two scaffolded tiers can't be removed,
   * and an env with live (or mid-operation) resources must be destroyed
   * first — the cascade then cleans up its deployments/secrets/incidents.
   */
  async remove(orgId: string, projectId: string, envId: string) {
    const env = await this.get(orgId, projectId, envId);
    if (env.type !== "CUSTOM") {
      throw new BadRequestException(
        "Only custom environments can be deleted (staging/production are permanent)",
      );
    }
    if (!DELETABLE_STATUSES.has(env.status)) {
      throw new BadRequestException(
        "Destroy this environment's stack before deleting it",
      );
    }
    await this.prisma.environment.delete({ where: { id: envId } });
    return { ok: true };
  }

  async list(orgId: string, projectId: string) {
    await this.projects.get(orgId, projectId);
    return this.prisma.environment.findMany({ where: { projectId } });
  }

  async get(orgId: string, projectId: string, envId: string) {
    await this.projects.get(orgId, projectId);
    const env = await this.prisma.environment.findFirst({
      where: { id: envId, projectId },
    });
    if (!env) throw new NotFoundException("Environment not found");
    return env;
  }

  async update(
    orgId: string,
    projectId: string,
    envId: string,
    data: {
      awsAccountId?: string;
      awsRoleArn?: string;
      region?: string;
      domain?: string;
      heizenConfig?: unknown;
      imageUri?: string;
      deployStrategy?: DeployStrategy;
      ec2InstanceType?: string;
    },
  ) {
    const existing = await this.get(orgId, projectId, envId);
    // Runtime-validate the enum field — the @Body() type is compile-time
    // only, so a bad client value would otherwise reach Prisma as a 500
    // instead of a clean 400.
    if (
      data.deployStrategy !== undefined &&
      !deployStrategySchema.safeParse(data.deployStrategy).success
    ) {
      throw new BadRequestException(
        `Invalid deployStrategy "${data.deployStrategy}"`,
      );
    }
    // Validate the region against the curated AWS list, and — when this env
    // deploys on Lightsail — against Lightsail's narrower availability, so a
    // bad region fails fast here instead of cryptically at `pulumi up`.
    if (data.region !== undefined) {
      if (!isAwsRegion(data.region)) {
        throw new BadRequestException(`Unsupported AWS region "${data.region}"`);
      }
      const strategy =
        data.deployStrategy ?? resolveEnvDeploy(existing).deployStrategy;
      if (strategy === "LIGHTSAIL" && !isLightsailRegion(data.region)) {
        throw new BadRequestException(
          `Lightsail is not available in "${data.region}". Choose one of: ${LIGHTSAIL_REGIONS.join(", ")}`,
        );
      }
    }
    // The account id is derived from the role ARN — never a separate client
    // input — so the stored value stays correct without a form field. Only
    // recompute when the ARN actually changes; `existing` is already loaded
    // above, so this guard costs no extra query.
    const patch: Record<string, unknown> = { ...data };
    if (
      data.awsRoleArn !== undefined &&
      data.awsRoleArn !== existing.awsRoleArn
    ) {
      patch.awsAccountId = accountIdFromRoleArn(data.awsRoleArn);
    }
    return this.prisma.environment.update({
      where: { id: envId },
      data: patch,
    });
  }

  async verifyAws(orgId: string, projectId: string, envId: string) {
    const env = await this.get(orgId, projectId, envId);
    if (!env.awsRoleArn || !env.region) {
      throw new NotFoundException("AWS role ARN and region must be configured");
    }

    await assumeCustomerRole(env.awsRoleArn, envId, env.region);
    return { ok: true, message: "Successfully assumed role" };
  }

  /**
   * Lists ECR images (repositoryUri:tag) in the customer's account/region via
   * the assumed deploy role — the deploy form's per-service image dropdowns.
   * Returns full pullable refs so the worker can inject them straight into
   * docker-compose. Degrades to an empty list on an account with no repos.
   */
  async listEcrImages(orgId: string, projectId: string, envId: string) {
    const env = await this.get(orgId, projectId, envId);
    if (!env.awsRoleArn || !env.region) {
      throw new BadRequestException(
        "Configure the AWS role ARN and region before listing ECR images.",
      );
    }
    const creds = await assumeCustomerRole(env.awsRoleArn, envId, env.region);
    const ecr = new ECRClient({
      region: creds.region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      },
    });
    try {
      const images: string[] = [];
      let repoToken: string | undefined;
      do {
        const repos = await ecr.send(
          new DescribeRepositoriesCommand({ maxResults: 100, nextToken: repoToken }),
        );
        for (const repo of repos.repositories ?? []) {
          if (!repo.repositoryName || !repo.repositoryUri) continue;
          let imgToken: string | undefined;
          do {
            const imgs = await ecr.send(
              new ListImagesCommand({
                repositoryName: repo.repositoryName,
                maxResults: 100,
                nextToken: imgToken,
              }),
            );
            for (const id of imgs.imageIds ?? []) {
              if (id.imageTag) images.push(`${repo.repositoryUri}:${id.imageTag}`);
            }
            imgToken = imgs.nextToken;
          } while (imgToken);
        }
        repoToken = repos.nextToken;
      } while (repoToken);
      images.sort();
      return { images };
    } finally {
      ecr.destroy();
    }
  }
}
