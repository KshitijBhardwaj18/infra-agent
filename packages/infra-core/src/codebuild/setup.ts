import {
  ECRClient,
  CreateRepositoryCommand,
  DescribeRepositoriesCommand,
} from "@aws-sdk/client-ecr";
import {
  IAMClient,
  CreateRoleCommand,
  PutRolePolicyCommand,
  GetRoleCommand,
} from "@aws-sdk/client-iam";
import {
  CodeBuildClient,
  CreateProjectCommand,
  UpdateProjectCommand,
} from "@aws-sdk/client-codebuild";
import { BUILDSPEC } from "./buildspec";

export interface CodeBuildSetupOptions {
  projectName: string;
  ecrRepoName: string;
  roleName: string;
  region: string;
  platformAccountId: string;
}

export interface CodeBuildSetupResult {
  ecrUri: string;
  codebuildProjectName: string;
  roleArn: string;
}

export async function ensureCodeBuildProject(
  options: CodeBuildSetupOptions,
): Promise<CodeBuildSetupResult> {
  const { projectName, ecrRepoName, roleName, region, platformAccountId } =
    options;

  const ecr = new ECRClient({ region });
  const iam = new IAMClient({ region });
  const codebuild = new CodeBuildClient({ region });

  let ecrUri: string;
  try {
    const existing = await ecr.send(
      new DescribeRepositoriesCommand({ repositoryNames: [ecrRepoName] }),
    );
    ecrUri = existing.repositories![0]!.repositoryUri!;
  } catch {
    const created = await ecr.send(
      new CreateRepositoryCommand({
        repositoryName: ecrRepoName,
        imageScanningConfiguration: { scanOnPush: true },
      }),
    );
    ecrUri = created.repository!.repositoryUri!;
  }

  const roleArn = `arn:aws:iam::${platformAccountId}:role/${roleName}`;

  try {
    await iam.send(new GetRoleCommand({ RoleName: roleName }));
  } catch {
    await iam.send(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "codebuild.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        }),
      }),
    );

    await iam.send(
      new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: `${roleName}-policy`,
        PolicyDocument: JSON.stringify({
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
      }),
    );
  }

  const projectConfig = {
    name: projectName,
    description: `Heizen Docker build for ${projectName}`,
    source: {
      type: "NO_SOURCE" as const,
      buildspec: BUILDSPEC,
    },
    artifacts: { type: "NO_ARTIFACTS" as const },
    environment: {
      type: "LINUX_CONTAINER" as const,
      computeType: "BUILD_GENERAL1_SMALL" as const,
      image: "aws/codebuild/standard:7.0",
      privilegedMode: true,
      environmentVariables: [
        { name: "AWS_DEFAULT_REGION", value: region, type: "PLAINTEXT" as const },
      ],
    },
    serviceRole: roleArn,
    logsConfig: {
      cloudWatchLogs: {
        status: "ENABLED" as const,
        groupName: `/aws/codebuild/${projectName}`,
      },
    },
  };

  try {
    await codebuild.send(new CreateProjectCommand(projectConfig));
  } catch {
    await codebuild.send(new UpdateProjectCommand(projectConfig));
  }

  return { ecrUri, codebuildProjectName: projectName, roleArn };
}
