/**
 * Helpers that build the three text artifacts a Lightsail deploy ships
 * onto the VM via cloud-init Pulumi config secrets:
 *
 *  1. docker-compose.yml — the user's, fetched fresh from their repo at
 *     deploy time so the deployed compose always matches the branch.
 *  2. docker-compose.caddy.yml — platform-generated; runs Caddy as a
 *     sidecar container that joins the user's compose network.
 *  3. Caddyfile — platform-generated from heizenConfig.routing.
 *  4. .env — concatenated KEY=value lines from the Secrets tab.
 *
 * Everything returned here is plain text; the worker base64-encodes it
 * before passing to Pulumi.
 */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { HeizenConfig, ParsedCompose, RoutingEntry } from "@heizen/shared";

/**
 * Rewrites the `image:` of named docker-compose services with chosen refs
 * (e.g. an ECR image picked in the deploy form). Only services that exist
 * AND have an override are touched — every other service is left as-is, and
 * an unknown service name is a silent no-op (e.g. a stale config after a
 * compose rename). Re-serializes via the YAML lib; the compose is shipped as
 * a fresh artifact regardless, so a parse→stringify round-trip is fine.
 */
export function applyImageOverrides(
  rawYaml: string,
  overrides: Record<string, string>,
): string {
  if (!overrides || Object.keys(overrides).length === 0) return rawYaml;
  const doc = parseYaml(rawYaml) as {
    services?: Record<string, { image?: string; build?: unknown }>;
  } | null;
  if (!doc?.services) return rawYaml;
  let changed = false;
  for (const [name, ref] of Object.entries(overrides)) {
    const svc = doc.services[name];
    if (svc && ref) {
      svc.image = ref;
      // Picking an image means "pull this exact ref", so drop any `build:`.
      // The VM never has the build context anyway (only the compose +
      // artifacts ship), so a leftover build: would just fail the deploy.
      if ("build" in svc) delete svc.build;
      changed = true;
    }
  }
  return changed ? stringifyYaml(doc) : rawYaml;
}

export interface LightsailArtifacts {
  composeYaml: string;
  caddyComposeYaml: string;
  caddyfile: string;
  envFile: string;
  ecrRegistry: string;
  // Log-shipper sidecar overlay + its config. Inert text — the worker only
  // ships them (and adds the `-f` flag) when the env opts into grafana-loki.
  alloyComposeYaml: string;
  alloyConfigYaml: string;
}

export interface BuildArtifactsInput {
  cfg: HeizenConfig;
  /** Raw docker-compose.yml from the user's repo. Source of truth. */
  composeYaml: string;
  /** Parsed view of the compose — used to validate routing entries
   *  point at services that actually exist. */
  parsedCompose: ParsedCompose;
  /** Concatenated KEY=value env vars from the Secrets tab (shared +
   *  per-service). Lightsail doesn't split per-service since the env
   *  applies to the whole compose project. */
  envVars: Record<string, string>;
  caddyEmail: string;
}

// Neutral prefix — this builder serves both the Lightsail and EC2
// (Caddy-on-a-VM) targets, so the message must not name one of them.
const ROUTING_ERR_PREFIX = "Routing config:";

/**
 * When the user configured no routing, we serve the most-likely web
 * service over plain HTTP on the box's public IP so the deploy is
 * reachable immediately (no DNS/cert setup required). Returns null only
 * if no compose service exposes a port at all.
 */
export function pickDefaultRoute(
  parsed: ParsedCompose,
): { service: string; port: number } | null {
  const candidates = parsed.services.filter(
    (s) => s.ports.length > 0 && !(s.hasBuild && !s.image),
  );
  if (candidates.length === 0) return null;
  const preferred =
    candidates.find((s) => /^(web|frontend|app|www|client|ui)$/i.test(s.name)) ??
    candidates[0];
  const port =
    (preferred.ports.find((p) => p.host != null) ?? preferred.ports[0]!).container;
  return { service: preferred.name, port };
}

export function validateRouting(
  routing: Record<string, RoutingEntry> | undefined,
  parsed: ParsedCompose,
): void {
  // Empty routing is allowed: buildCaddyfile falls back to serving the
  // primary service over HTTP on the box's IP (pickDefaultRoute). We
  // only fail later if nothing exposes a port. So no throw here.
  if (!routing || Object.keys(routing).length === 0) return;

  const composeNames = new Set(parsed.services.map((s) => s.name));
  const seenDomains = new Set<string>();

  for (const [serviceName, entry] of Object.entries(routing)) {
    if (!composeNames.has(serviceName)) {
      throw new Error(
        `${ROUTING_ERR_PREFIX} service "${serviceName}" not found in docker-compose.yml. Re-index the repo if the compose changed.`,
      );
    }
    if (!entry.domain || !entry.domain.trim()) {
      throw new Error(
        `${ROUTING_ERR_PREFIX} service "${serviceName}" has no domain. Set one before deploying.`,
      );
    }
    const dom = entry.domain.trim().toLowerCase();
    if (seenDomains.has(dom)) {
      throw new Error(
        `${ROUTING_ERR_PREFIX} domain "${dom}" is assigned to multiple services. Each domain can only point at one service.`,
      );
    }
    seenDomains.add(dom);

    const svc = parsed.services.find((s) => s.name === serviceName)!;
    if (svc.hasBuild && !svc.image) {
      throw new Error(
        `${ROUTING_ERR_PREFIX} service "${serviceName}" uses build: but no image:. Lightsail can't build images on the box — push a prebuilt image to a registry and reference it via image:.`,
      );
    }
    const knownPorts = svc.ports.map((p) => p.container);
    if (knownPorts.length > 0 && !knownPorts.includes(entry.containerPort)) {
      throw new Error(
        `${ROUTING_ERR_PREFIX} service "${serviceName}" routes to port ${entry.containerPort}, but compose only exposes ${knownPorts.join(", ")}.`,
      );
    }
  }
}

export function buildCaddyfile(
  routing: Record<string, RoutingEntry> | undefined,
  caddyEmail: string,
  parsed?: ParsedCompose,
): string {
  const lines: string[] = [];
  lines.push("# Generated by Heizen. Do not edit by hand.");
  lines.push("{");
  lines.push(`  email ${caddyEmail}`);
  lines.push("}");
  lines.push("");

  const entries = Object.entries(routing ?? {});

  // No hostnames configured → serve the primary service over HTTP on the
  // box's public IP so the deploy is reachable without DNS. The user can
  // add hostnames later for HTTPS.
  if (entries.length === 0) {
    const def = parsed ? pickDefaultRoute(parsed) : null;
    if (!def) {
      throw new Error(
        `${ROUTING_ERR_PREFIX} no routing configured and no compose service exposes a port to serve. Add a port to a service, or set a hostname in the deploy form.`,
      );
    }
    lines.push("# No hostnames configured — serving the primary service over");
    lines.push("# HTTP on the box's public IP. Add a hostname for HTTPS.");
    lines.push(":80 {");
    lines.push(`  reverse_proxy ${def.service}:${def.port} {`);
    lines.push(`    flush_interval -1`);
    lines.push(`    transport http {`);
    lines.push(`      read_timeout 30m`);
    lines.push(`      write_timeout 30m`);
    lines.push(`    }`);
    lines.push(`  }`);
    lines.push("}");
    lines.push("");
    return lines.join("\n");
  }

  for (const [serviceName, entry] of entries) {
    lines.push(`${entry.domain.trim()} {`);
    // SSE/WS friendly + sane timeouts. Matches what we use in prod for
    // the api service to keep deploy log streams alive.
    lines.push(`  reverse_proxy ${serviceName}:${entry.containerPort} {`);
    lines.push(`    flush_interval -1`);
    lines.push(`    transport http {`);
    lines.push(`      read_timeout 30m`);
    lines.push(`      write_timeout 30m`);
    lines.push(`    }`);
    lines.push(`  }`);
    lines.push(`}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Sidecar compose file that adds Caddy to the user's docker-compose
 * project. Merged at runtime via `docker compose -f user.yml -f caddy.yml`.
 *
 * Caddy joins the default network of the merged project (auto-named),
 * so it can reach user services by their compose service name —
 * "web", "api", etc. — without host port mapping. Only Caddy itself
 * publishes 80/443 to the host.
 */
export function buildCaddyComposeYaml(): string {
  return `# Generated by Heizen. Do not edit by hand.
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      # Relative path resolves against the compose file's directory
      # (the project folder, e.g. /home/ubuntu/heizen) so the Caddyfile
      # lives alongside docker-compose.yml instead of under /etc/caddy.
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - heizen_caddy_data:/data
      - heizen_caddy_config:/config

volumes:
  heizen_caddy_data:
  heizen_caddy_config:
`;
}

/**
 * Grafana Alloy log-shipper sidecar overlay. Uses the stock grafana/alloy
 * image and reads its config + Loki target from files/env that the worker
 * supplies, so nothing here is customer-specific. Mounts the docker socket
 * read-only to discover and tail every container's logs.
 */
export function buildAlloyComposeYaml(): string {
  return `# Generated by Heizen. Do not edit by hand.
services:
  alloy:
    image: grafana/alloy:latest
    command: ["run", "/etc/alloy/config.alloy"]
    restart: unless-stopped
    environment:
      - LOKI_PUSH_URL=\${LOKI_PUSH_URL}
      - LOKI_TOKEN=\${LOKI_TOKEN}
      - HEIZEN_ENV_ID=\${HEIZEN_ENV_ID}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./config.alloy:/etc/alloy/config.alloy:ro
`;
}

/**
 * Alloy config: discover docker containers, label each line with the
 * compose service + heizen_env (so our reader can query
 * {heizen_env="<envId>"}), and push to the customer's Loki.
 */
export function buildAlloyConfig(): string {
  return `// Generated by Heizen. Do not edit by hand.
discovery.docker "containers" {
  host = "unix:///var/run/docker.sock"
}

discovery.relabel "containers" {
  targets = discovery.docker.containers.targets
  rule {
    source_labels = ["__meta_docker_container_label_com_docker_compose_service"]
    target_label  = "compose_service"
  }
}

loki.source.docker "containers" {
  host       = "unix:///var/run/docker.sock"
  targets    = discovery.relabel.containers.output
  labels     = { heizen_env = sys.env("HEIZEN_ENV_ID") }
  forward_to = [loki.write.default.receiver]
}

loki.write "default" {
  endpoint {
    url          = sys.env("LOKI_PUSH_URL")
    bearer_token = sys.env("LOKI_TOKEN")
  }
}
`;
}

/**
 * Build the .env file content from a map. Keys are sorted for
 * deterministic output (helps with Pulumi state diffs).
 *
 * Values containing newlines (e.g. a PEM private key) are emitted in
 * quoted form. We don't escape interior double-quotes — the user is
 * responsible for not putting bare " in secret values, and most real
 * secrets are b64 / hex / base64 anyway.
 */
export function buildEnvFile(envVars: Record<string, string>): string {
  const lines: string[] = [];
  for (const key of Object.keys(envVars).sort()) {
    const value = envVars[key] ?? "";
    if (value.includes("\n")) {
      lines.push(`${key}="${value}"`);
    } else {
      lines.push(`${key}=${value}`);
    }
  }
  return lines.join("\n") + "\n";
}

export function buildLightsailArtifacts(
  input: BuildArtifactsInput,
): LightsailArtifacts {
  validateRouting(input.cfg.routing, input.parsedCompose);

  return {
    composeYaml: input.composeYaml,
    caddyComposeYaml: buildCaddyComposeYaml(),
    alloyComposeYaml: buildAlloyComposeYaml(),
    alloyConfigYaml: buildAlloyConfig(),
    caddyfile: buildCaddyfile(
      input.cfg.routing,
      input.caddyEmail,
      input.parsedCompose,
    ),
    envFile: buildEnvFile(input.envVars),
    // ECR registry is derived from the image URI at the worker layer
    // (where we have STS creds + the ecr namespace). Filled by the
    // worker; this is just plumbing for clarity.
    ecrRegistry: "",
  };
}
