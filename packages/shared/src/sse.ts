import type { HeizenConfig } from "./heizen-config";

export type DeploymentPhase = "PULUMI" | "SYSTEM";
export type DeploymentStatus =
  | "QUEUED"
  | "DEPLOYING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED";
export type EnvironmentStatus =
  | "NOT_DEPLOYED"
  | "DEPLOYING"
  | "LIVE"
  | "FAILED"
  | "DESTROYING"
  | "DESTROYED";

export type IndexingStep =
  | "cloning"
  | "collecting"
  | "detecting"
  | "analyzing"
  | "complete";

export interface IndexingSsePayload {
  step: IndexingStep;
  data?: unknown;
}

export interface DeploymentLogPayload {
  phase: DeploymentPhase;
  level: string;
  message: string;
}

export interface DeploymentStatusSsePayload {
  type: "status";
  status: DeploymentStatus;
}

export interface DeploymentStatusPayload {
  deploymentId: string;
  status: DeploymentStatus;
}

export interface EnvironmentStatusPayload {
  environmentId: string;
  status: EnvironmentStatus;
}

export interface IndexingCompletePayload {
  projectId: string;
  result: HeizenConfig | null;
  error?: string;
}

export interface GithubDisconnectedPayload {
  projectIds: string[];
  reason: "uninstalled" | "suspended" | "repo_removed";
}

export interface AgentChatSsePayload {
  text?: string;
  type?: "done";
  fullMessage?: string;
}

export type WebSocketEvent =
  | { event: "deployment:status"; data: DeploymentStatusPayload }
  | { event: "environment:status"; data: EnvironmentStatusPayload }
  | { event: "indexing:complete"; data: IndexingCompletePayload }
  | { event: "github:disconnected"; data: GithubDisconnectedPayload };
