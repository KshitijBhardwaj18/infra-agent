// Shared contracts for the SRE agent: the ChatOps layer (deploy/control
// via chat) and the observability/incident layer. Mirrors the Prisma
// enums so the API and web agree on the wire shape.

export type IncidentSeverity = "CRITICAL" | "WARNING" | "INFO";
export type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
export type IncidentSource =
  | "HEALTHCHECK"
  | "AGENT"
  | "MANUAL"
  | "DEPLOYMENT"
  | "LOGS"
  | "METRICS";

/**
 * Structured output of the intelligence layer for one incident: what
 * probably broke, why we think so, and what to do about it.
 */
export interface IncidentAnalysis {
  summary: string;
  rootCause: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
  suggestedActions: string[];
  /** Set when the incident window correlates with a recent deployment. */
  correlatedDeploymentId: string | null;
  /** ISO timestamp of when the analysis ran. */
  analyzedAt: string;
}

export interface Incident {
  id: string;
  environmentId: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  source: IncidentSource;
  title: string;
  detail: string | null;
  /** Agent-generated, human-readable remediation guidance. */
  suggestedRemedy: string | null;
  fingerprint: string | null;
  metadata: Record<string, unknown> | null;
  analysis: IncidentAnalysis | null;
  /** How many scans observed this signal firing (recurrence grouping). */
  occurrences: number;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

/**
 * A destructive/stateful action the agent proposes but does NOT execute
 * — the chat UI renders a confirm card and the human approves it (the
 * standard ChatOps human-in-the-loop pattern). Read-only answers don't
 * use this.
 */
export interface ProposedAction {
  kind: "deploy" | "destroy" | "restart";
  projectId: string;
  envId: string;
  envType: string;
  /** For kind "restart": the compose service to restart. */
  serviceName?: string;
  /** Short human label, e.g. "Deploy production (EC2)". */
  label: string;
  /** Why the agent is proposing it / what it will do. */
  rationale?: string;
}

export interface ChatResponse {
  message: string;
  /** Present when the agent wants the human to confirm a deploy/destroy. */
  proposedAction?: ProposedAction | null;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// ── Logs layer ──────────────────────────────────────────────────────

export interface LogLine {
  /** ISO timestamp (best-effort — on-box logs may lack one). */
  ts: string | null;
  /** Compose service the line came from, when known. */
  service: string | null;
  line: string;
}

/** A group of similar log lines (numbers/ids normalized away). */
export interface LogCluster {
  signature: string;
  count: number;
  level: "error" | "warn" | "other";
  sample: string;
}

export interface LogStats {
  total: number;
  errors: number;
  warns: number;
  clusters: LogCluster[];
}

export interface LogsResponse {
  /** Where the logs came from: Grafana Loki, CloudWatch Logs (ECS), or the EC2 box over SSM. */
  source: "loki" | "vm" | "cloudwatch";
  windowMinutes: number;
  lines: LogLine[];
  truncated: boolean;
  stats: LogStats;
}

/** Structured output of the log-intelligence layer. */
export interface LogAnalysis {
  health: "healthy" | "degraded" | "down" | "unknown";
  summary: string;
  issues: Array<{
    title: string;
    severity: IncidentSeverity;
    evidence: string;
    likelyCause: string;
  }>;
  /** Signs of latency/slowness (timeouts, slow queries, retries...). */
  slownessIndicators: string[];
  recommendedActions: string[];
  source: "loki" | "vm" | "cloudwatch";
  windowMinutes: number;
  analyzedAt: string;
}
