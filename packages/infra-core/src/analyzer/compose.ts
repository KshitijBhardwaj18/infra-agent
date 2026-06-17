import * as fs from "fs/promises";
import * as path from "path";
import { parse as parseYaml } from "yaml";

const CANDIDATE_FILENAMES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
];

export interface ComposePortMapping {
  /** Host-side port. null when only container port is set (random host port). */
  host: number | null;
  /** In-container port the service listens on. */
  container: number;
  protocol: "tcp" | "udp";
}

export interface ComposeService {
  name: string;
  image: string | null;
  /** True when the service uses `build:` instead of `image:`. Not supported
   *  by the Lightsail template (no remote build infra); UI should warn. */
  hasBuild: boolean;
  ports: ComposePortMapping[];
  /** Names of ${VAR} references found in the service's environment block.
   *  Surfaced to the UI so users know which Secrets are needed. */
  envRefs: string[];
  hasVolumes: boolean;
  /** Compose-level service dependencies declared in `depends_on:`. Useful
   *  for ordering / visualisation. */
  dependsOn: string[];
}

export interface ParsedCompose {
  /** Relative path from the repo root (e.g. "docker-compose.yml"). */
  filePath: string;
  /** Raw file contents — kept so deploy time can ship it verbatim
   *  without re-parsing. */
  raw: string;
  services: ComposeService[];
}

/**
 * Locate and parse the first docker-compose file at the repo root.
 * Returns null if none found (e.g. an ECS-only project). Throws on
 * malformed YAML or unrecognised top-level structure — those are
 * configuration bugs the user wants to know about, not silent skips.
 */
export async function findAndParseCompose(
  repoRoot: string,
): Promise<ParsedCompose | null> {
  for (const candidate of CANDIDATE_FILENAMES) {
    const p = path.join(repoRoot, candidate);
    try {
      const raw = await fs.readFile(p, "utf8");
      const services = parseComposeYaml(raw);
      return { filePath: candidate, raw, services };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
  }
  return null;
}

/**
 * Parse a compose YAML string into normalised services. Tolerant of the
 * three common port-mapping shapes ("3000", "3000:3000", "127.0.0.1:3000:3000")
 * and the two environment shapes (array of "KEY=value" vs map).
 */
export function parseComposeYaml(raw: string): ComposeService[] {
  const doc = parseYaml(raw) as
    | { services?: Record<string, RawComposeService> }
    | null
    | undefined;
  if (!doc || typeof doc !== "object" || !doc.services) return [];

  const out: ComposeService[] = [];
  for (const [name, svc] of Object.entries(doc.services)) {
    if (!svc || typeof svc !== "object") continue;
    out.push({
      name,
      image: typeof svc.image === "string" ? svc.image : null,
      hasBuild: svc.build !== undefined,
      ports: parsePorts(svc.ports),
      envRefs: collectEnvRefs(svc),
      hasVolumes: Array.isArray(svc.volumes) && svc.volumes.length > 0,
      dependsOn: parseDependsOn(svc.depends_on),
    });
  }
  return out;
}

interface RawComposeService {
  image?: unknown;
  build?: unknown;
  ports?: unknown;
  environment?: unknown;
  volumes?: unknown;
  depends_on?: unknown;
  env_file?: unknown;
}

function parsePorts(ports: unknown): ComposePortMapping[] {
  if (!Array.isArray(ports)) return [];
  const out: ComposePortMapping[] = [];
  for (const entry of ports) {
    if (typeof entry === "number") {
      out.push({ host: null, container: entry, protocol: "tcp" });
      continue;
    }
    if (typeof entry !== "string") continue;
    // Forms: "3000", "3000:3000", "127.0.0.1:3000:3000", "3000:3000/udp"
    const [body, proto] = entry.split("/");
    const parts = body!.split(":");
    const last = parts[parts.length - 1]!;
    const container = parseInt(last, 10);
    if (Number.isNaN(container)) continue;
    let host: number | null = null;
    if (parts.length >= 2) {
      const hostStr = parts[parts.length - 2]!;
      const parsed = parseInt(hostStr, 10);
      if (!Number.isNaN(parsed)) host = parsed;
    }
    out.push({
      host,
      container,
      protocol: proto === "udp" ? "udp" : "tcp",
    });
  }
  return out;
}

const ENV_REF_RE = /\$\{?([A-Z_][A-Z0-9_]*)\}?/g;

function collectEnvRefs(svc: RawComposeService): string[] {
  const refs = new Set<string>();
  const sources: string[] = [];

  if (Array.isArray(svc.environment)) {
    for (const e of svc.environment) {
      if (typeof e === "string") sources.push(e);
    }
  } else if (svc.environment && typeof svc.environment === "object") {
    for (const v of Object.values(svc.environment as Record<string, unknown>)) {
      if (typeof v === "string") sources.push(v);
    }
  }

  for (const s of sources) {
    for (const m of s.matchAll(ENV_REF_RE)) {
      const name = m[1]!;
      // Skip the common docker-compose self-references — not user secrets.
      if (name.startsWith("COMPOSE_")) continue;
      refs.add(name);
    }
  }

  return [...refs];
}

function parseDependsOn(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === "string");
  }
  if (raw && typeof raw === "object") {
    return Object.keys(raw);
  }
  return [];
}
