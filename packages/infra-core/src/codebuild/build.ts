import {
  CodeBuildClient,
  StartBuildCommand,
  BatchGetBuildsCommand,
  type Build,
} from "@aws-sdk/client-codebuild";
import {
  CloudWatchLogsClient,
  GetLogEventsCommand,
  DescribeLogStreamsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import type { AwsCredentials } from "../pulumi/aws-role";

export interface BuildLogCallback {
  (message: string, level: string): void;
}

export interface StartBuildOptions {
  projectName: string;
  region: string;
  awsCreds: AwsCredentials;
  envOverrides: Record<string, string>;
  onLog: BuildLogCallback;
}

const POLL_INTERVAL_MS = 5000;
const BUILD_TIMEOUT_MS = 30 * 60 * 1000;

export async function startBuildAndStream(
  options: StartBuildOptions,
): Promise<{ buildId: string; imageTag: string }> {
  const { projectName, region, awsCreds, envOverrides, onLog } = options;

  const credentials = {
    accessKeyId: awsCreds.accessKeyId,
    secretAccessKey: awsCreds.secretAccessKey,
    sessionToken: awsCreds.sessionToken,
  };

  const codebuild = new CodeBuildClient({ region, credentials });
  const logs = new CloudWatchLogsClient({ region, credentials });

  const startResult = await codebuild.send(
    new StartBuildCommand({
      projectName,
      environmentVariablesOverride: Object.entries(envOverrides).map(
        ([name, value]) => ({ name, value, type: "PLAINTEXT" }),
      ),
    }),
  );

  const buildId = startResult.build!.id!;
  const imageTag = envOverrides.IMAGE_TAG ?? "latest";
  const logGroupName = `/aws/codebuild/${projectName}`;

  let build: Build | undefined;
  let lastEventTimestamp = 0;
  let logStreamName: string | undefined;
  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > BUILD_TIMEOUT_MS) {
      throw new Error(
        `CodeBuild timed out after 30 minutes. Build ID: ${buildId}`,
      );
    }

    const batchResult = await codebuild.send(
      new BatchGetBuildsCommand({ ids: [buildId] }),
    );
    build = batchResult.builds?.[0];

    if (!build) {
      throw new Error(`Build ${buildId} not found`);
    }

    if (build.logs?.streamName) {
      logStreamName = build.logs.streamName;
    }

    if (logStreamName) {
      try {
        const logEvents = await logs.send(
          new GetLogEventsCommand({
            logGroupName,
            logStreamName,
            startTime: lastEventTimestamp > 0 ? lastEventTimestamp + 1 : undefined,
            startFromHead: lastEventTimestamp === 0,
          }),
        );

        for (const event of logEvents.events ?? []) {
          if (event.timestamp && event.timestamp > lastEventTimestamp) {
            lastEventTimestamp = event.timestamp;
          }
          if (event.message) {
            const level = event.message.toLowerCase().includes("error")
              ? "error"
              : "info";
            onLog(event.message.trim(), level);
          }
        }
      } catch {
        // log stream may not exist yet
      }
    } else {
      try {
        const streams = await logs.send(
          new DescribeLogStreamsCommand({
            logGroupName,
            orderBy: "LastEventTime",
            descending: true,
            limit: 1,
          }),
        );
        logStreamName = streams.logStreams?.[0]?.logStreamName;
      } catch {
        // log group may not exist yet
      }
    }

    const phase = build.currentPhase;
    const status = build.buildStatus;

    if (status === "SUCCEEDED") {
      onLog(`Build ${buildId} succeeded`, "info");
      break;
    }

    if (
      status === "FAILED" ||
      status === "FAULT" ||
      status === "STOPPED" ||
      status === "TIMED_OUT"
    ) {
      throw new Error(
        `CodeBuild failed: status=${status}, phase=${phase}, id=${buildId}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return { buildId, imageTag };
}
