import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
  InvocationDoesNotExist,
} from "@aws-sdk/client-ssm";
import type { AwsCredentials } from "./aws-role";

export interface SsmCommandOptions {
  /** EC2 instance id (from the stack's `instanceId` output). */
  instanceId: string;
  /** Customer creds (the assumed role) — same ones used for pulumi up.
   *  Always carry a sessionToken (they're STS assumed-role creds). */
  awsCreds: AwsCredentials;
  /** Shell commands to run on the box (joined as one AWS-RunShellScript). */
  commands: string[];
  /** Progress/output callback (status ticks + final stdout/stderr). */
  onOutput?: (line: string) => void;
  /** Overall wait budget. Defaults to 10 minutes. */
  timeoutMs?: number;
}

const TERMINAL_OK = ["Success"];
const TERMINAL_BAD = ["Cancelled", "TimedOut", "Failed"];

/**
 * Runs a shell command on an EC2 instance via SSM RunCommand and waits
 * for it to finish. Used for in-place EC2 updates (re-sync the artifacts
 * bundle from S3 + `docker compose up`) without SSH — auth is the same
 * assumed-role creds, and the box's instance role carries the SSM perms.
 *
 * Throws if the command fails, times out, or the instance never reports.
 */
export async function runSsmCommand(opts: SsmCommandOptions): Promise<void> {
  const { instanceId, awsCreds, commands, onOutput, timeoutMs = 600_000 } = opts;

  const client = new SSMClient({
    region: awsCreds.region,
    credentials: {
      accessKeyId: awsCreds.accessKeyId,
      secretAccessKey: awsCreds.secretAccessKey,
      sessionToken: awsCreds.sessionToken,
    },
  });

  try {
    const sent = await client.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: "AWS-RunShellScript",
        Parameters: { commands },
        TimeoutSeconds: 3600,
        Comment: "heizen in-place deploy",
      }),
    );

    const commandId = sent.Command?.CommandId;
    if (!commandId) throw new Error("SSM SendCommand returned no CommandId");
    onOutput?.(`[ssm] command ${commandId} dispatched to ${instanceId}`);

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));

      let inv;
      try {
        inv = await client.send(
          new GetCommandInvocationCommand({
            CommandId: commandId,
            InstanceId: instanceId,
          }),
        );
      } catch (err) {
        // The invocation isn't queryable for a beat after SendCommand,
        // and briefly until the agent picks it up — keep polling. Use the
        // typed SDK v3 exception rather than a name-string check.
        if (err instanceof InvocationDoesNotExist) continue;
        throw err;
      }

      const status = inv.Status ?? "Pending";
      if (TERMINAL_OK.includes(status)) {
        if (inv.StandardOutputContent) onOutput?.(inv.StandardOutputContent);
        onOutput?.(`[ssm] command ${status.toLowerCase()}`);
        return;
      }
      if (TERMINAL_BAD.includes(status)) {
        const detail =
          inv.StandardErrorContent?.trim() || inv.StatusDetails || status;
        throw new Error(`SSM command ${status}: ${detail}`);
      }
      onOutput?.(`[ssm] ${status}...`);
    }

    throw new Error(
      `SSM command timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${instanceId}`,
    );
  } finally {
    // Release the SDK connection pool — the worker is long-running.
    client.destroy();
  }
}
