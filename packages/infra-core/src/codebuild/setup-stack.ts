import * as automation from "@pulumi/pulumi/automation";
import * as aws from "@pulumi/aws";
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

/**
 * Pulumi inline program that creates the per-environment build infrastructure:
 *   - ECR repository (Docker images)
 *   - IAM role for CodeBuild
 *   - CodeBuild project (docker build + push)
 *
 * Pulumi handles dependency ordering automatically — CodeBuild is only created
 * after the IAM role is ready, eliminating the IAM propagation delay bug.
 */
function createSetupProgram(opts: {
  ecrRepoName: string;
  roleName: string;
  projectName: string;
  region: string;
}) {
  return async () => {
    const ecr = new aws.ecr.Repository("ecr", {
      name: opts.ecrRepoName,
      imageScanningConfiguration: { scanOnPush: true },
      forceDelete: true,
    });

    const role = new aws.iam.Role("codebuild-role", {
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
    });

    new aws.iam.RolePolicy("codebuild-policy", {
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
    });

    const project = new aws.codebuild.Project("codebuild", {
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
    });

    return {
      ecrUri: ecr.repositoryUrl,
      codebuildProjectName: project.name,
      roleArn: role.arn,
    };
  };
}

/**
 * Runs the Pulumi setup stack for a given environment.
 * Idempotent: safe to call multiple times — Pulumi diffs and only makes changes.
 */
export async function runSetupStack(
  opts: SetupStackOptions,
): Promise<SetupStackOutputs> {
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
    codebuildProjectName: (outputs.codebuildProjectName?.value as string) ?? "",
    roleArn: (outputs.roleArn?.value as string) ?? "",
  };
}
