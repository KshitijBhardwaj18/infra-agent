import * as automation from "@pulumi/pulumi/automation";
import * as aws from "@pulumi/aws";
import {
  ECRClient,
  DescribeRepositoriesCommand,
} from "@aws-sdk/client-ecr";
import {
  IAMClient,
  GetRoleCommand,
  GetRolePolicyCommand,
} from "@aws-sdk/client-iam";
import {
  CodeBuildClient,
  BatchGetProjectsCommand,
} from "@aws-sdk/client-codebuild";
import { BUILDSPEC } from "./buildspec";
import type { AwsCredentials } from "../pulumi/aws-role";

export interface SetupStackOptions {
  stackName: string;
  backendBucket: string;
  passphrase: string;
  region: string;
  awsCreds: AwsCredentials;
  ecrRepoName: string;
  roleName: string;
  projectName: string;
  onOutput?: (line: string) => void;
}

export interface SetupStackOutputs {
  ecrUri: string;
  codebuildProjectName: string;
  roleArn: string;
}

interface ExistingResources {
  ecrExists: boolean;
  roleExists: boolean;
  rolePolicyExists: boolean;
  projectExists: boolean;
}

/**
 * Checks which resources already exist in AWS.
 * Runs once before Pulumi starts — not during program evaluation.
 */
async function detectExisting(
  ecrRepoName: string,
  roleName: string,
  projectName: string,
  region: string,
  creds: { accessKeyId: string; secretAccessKey: string; sessionToken: string },
): Promise<ExistingResources> {
  const ecr = new ECRClient({ region, credentials: creds });
  const iam = new IAMClient({ region, credentials: creds });
  const cb = new CodeBuildClient({ region, credentials: creds });

  const [ecrExists, roleExists, rolePolicyExists, projectExists] =
    await Promise.all([
      ecr
        .send(new DescribeRepositoriesCommand({ repositoryNames: [ecrRepoName] }))
        .then(() => true)
        .catch(() => false),
      iam
        .send(new GetRoleCommand({ RoleName: roleName }))
        .then(() => true)
        .catch(() => false),
      iam
        .send(
          new GetRolePolicyCommand({
            RoleName: roleName,
            PolicyName: `${roleName}-policy`,
          }),
        )
        .then(() => true)
        .catch(() => false),
      cb
        .send(new BatchGetProjectsCommand({ names: [projectName] }))
        .then((r) => (r.projects?.length ?? 0) > 0)
        .catch(() => false),
    ]);

  return { ecrExists, roleExists, rolePolicyExists, projectExists };
}

function createSetupProgram(opts: {
  ecrRepoName: string;
  roleName: string;
  projectName: string;
  region: string;
  existing: ExistingResources;
}) {
  return async () => {
    const { existing } = opts;

    const ecr = new aws.ecr.Repository(
      "ecr",
      {
        name: opts.ecrRepoName,
        imageScanningConfiguration: { scanOnPush: true },
        forceDelete: true,
      },
      {
        import: existing.ecrExists ? opts.ecrRepoName : undefined,
        ignoreChanges: existing.ecrExists
          ? ["imageScanningConfiguration", "forceDelete", "tags"]
          : [],
      },
    );

    const role = new aws.iam.Role(
      "codebuild-role",
      {
        name: opts.roleName,
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "codebuild.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        }),
      },
      {
        import: existing.roleExists ? opts.roleName : undefined,
        ignoreChanges: existing.roleExists ? ["assumeRolePolicy", "tags"] : [],
      },
    );

    new aws.iam.RolePolicy(
      "codebuild-policy",
      {
        name: `${opts.roleName}-policy`,
        role: role.id,
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "ecr:PutImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
              ],
              Resource: "*",
            },
            {
              Effect: "Allow",
              Action: [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents",
              ],
              Resource: "*",
            },
          ],
        }),
      },
      {
        import: existing.rolePolicyExists
          ? `${opts.roleName}:${opts.roleName}-policy`
          : undefined,
        ignoreChanges: existing.rolePolicyExists ? ["policy"] : [],
      },
    );

    const project = new aws.codebuild.Project(
      "codebuild",
      {
        name: opts.projectName,
        description: `Heizen Docker build for ${opts.projectName}`,
        serviceRole: role.arn,
        source: { type: "NO_SOURCE", buildspec: BUILDSPEC },
        artifacts: { type: "NO_ARTIFACTS" },
        environment: {
          type: "LINUX_CONTAINER",
          computeType: "BUILD_GENERAL1_SMALL",
          image: "aws/codebuild/standard:7.0",
          privilegedMode: true,
          environmentVariables: [
            {
              name: "AWS_DEFAULT_REGION",
              value: opts.region,
              type: "PLAINTEXT",
            },
          ],
        },
        logsConfig: {
          cloudwatchLogs: {
            status: "ENABLED",
            groupName: `/aws/codebuild/${opts.projectName}`,
          },
        },
      },
      {
        import: existing.projectExists ? opts.projectName : undefined,
        ignoreChanges: existing.projectExists
          ? ["environment", "logsConfig", "tags", "buildTimeout"]
          : [],
      },
    );

    return {
      ecrUri: ecr.repositoryUrl,
      codebuildProjectName: project.name,
      roleArn: role.arn,
    };
  };
}

export async function runSetupStack(
  opts: SetupStackOptions,
): Promise<SetupStackOutputs> {
  const existing = await detectExisting(
    opts.ecrRepoName,
    opts.roleName,
    opts.projectName,
    opts.region,
    {
      accessKeyId: opts.awsCreds.accessKeyId,
      secretAccessKey: opts.awsCreds.secretAccessKey,
      sessionToken: opts.awsCreds.sessionToken,
    },
  );

  const envVars: Record<string, string> = {
    AWS_ACCESS_KEY_ID: opts.awsCreds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: opts.awsCreds.secretAccessKey,
    AWS_SESSION_TOKEN: opts.awsCreds.sessionToken,
    AWS_DEFAULT_REGION: opts.region,
    PULUMI_BACKEND_URL: `s3://${opts.backendBucket}`,
    PULUMI_CONFIG_PASSPHRASE: opts.passphrase,
  };

  const stack = await automation.LocalWorkspace.createOrSelectStack(
    {
      stackName: opts.stackName,
      projectName: opts.stackName,
      program: createSetupProgram({
        ecrRepoName: opts.ecrRepoName,
        roleName: opts.roleName,
        projectName: opts.projectName,
        region: opts.region,
        existing,
      }),
    },
    { envVars },
  );

  await stack.setConfig("aws:region", { value: opts.region });

  const result = await stack.up({
    onOutput: opts.onOutput ?? (() => {}),
  });

  const outputs = result.outputs as Record<
    string,
    { value: unknown; secret: boolean }
  >;

  return {
    ecrUri: (outputs.ecrUri?.value as string) ?? "",
    codebuildProjectName:
      (outputs.codebuildProjectName?.value as string) ?? "",
    roleArn: (outputs.roleArn?.value as string) ?? "",
  };
}
