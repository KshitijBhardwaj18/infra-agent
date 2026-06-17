import "reflect-metadata";
import type { Request, Response, NextFunction } from "express";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { getQueueToken } from "@nestjs/bullmq";
import { AppModule } from "./app.module";
import { auth } from "./auth/auth.config";
import { toNodeHandler } from "better-auth/node";
import { cleanStaleTempDirs } from "./common/clean-stale-temp-dirs";
import { cleanupStaleDeployments } from "./common/cleanup-stale-jobs";
import {
  bootstrapSingleOrg,
  bootstrapAdminUser,
  bootstrapGithubConnection,
} from "./common/bootstrap";
import { PRISMA } from "./prisma/prisma.module";
import { env } from "./common/env";
import { readDeployRoleTemplate } from "@heizen/infra-core";

const DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3002",
  "http://127.0.0.1:3002",
];

const REQUIRED_PRODUCTION_ENV = [
  "DATABASE_URL",
  "REDIS_URL",
  "CORS_ORIGIN",
  "BETTER_AUTH_SECRET",
  "ENCRYPTION_KEY",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_APP_CLIENT_ID",
  "GITHUB_APP_CLIENT_SECRET",
  "GITHUB_APP_SLUG",
  "GITHUB_STATE_SECRET",
  "GITHUB_WEBHOOK_SECRET",
  "PULUMI_CONFIG_PASSPHRASE",
  "PLATFORM_AWS_ACCOUNT_ID",
  "PLATFORM_AWS_ACCESS_KEY_ID",
  "PLATFORM_AWS_SECRET_ACCESS_KEY",
] as const;

function assertProductionConfig() {
  if (process.env.NODE_ENV !== "production") return;
  const missing = REQUIRED_PRODUCTION_ENV.filter((k) => !env(k));
  if (missing.length > 0) {
    console.error(`FATAL: missing required production env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
}

async function verifyBundledAssets() {
  // Fail-fast (visibly) if the bundled CloudFormation deploy-role template
  // didn't ship in infra-core's dist — that means a broken build, and we'd
  // rather surface it at boot than when a customer first opens AWS setup.
  // Non-fatal: a missing optional asset shouldn't take down auth/deploys.
  try {
    await readDeployRoleTemplate();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Error-level (not warn): a missing build artifact is a real problem ops
    // should see. State the operational impact so the log line is actionable.
    new Logger("Bootstrap").error(
      `BUILD ASSET MISSING — the AWS deploy-role CloudFormation template did not ` +
        `ship in this build; one-click AWS setup will be unavailable until the ` +
        `build is fixed. Underlying error: ${msg}`,
    );
  }
}

function getAllowedOrigins(): string[] {
  const fromEnv = env("CORS_ORIGIN");
  const parsed = fromEnv
    ? fromEnv.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  return [...new Set([...parsed, ...DEFAULT_ORIGINS])];
}

function authCorsMiddleware(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Cookie",
    );
    res.setHeader("Access-Control-Expose-Headers", "Set-Cookie");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}

async function bootstrap() {
  assertProductionConfig();

  await verifyBundledAssets();

  await cleanStaleTempDirs();

  const allowedOrigins = getAllowedOrigins();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  const expressApp = app.getHttpAdapter().getInstance();

  // Trust the reverse proxy (Caddy / load balancer) so req.protocol reflects
  // the original HTTPS scheme via X-Forwarded-Proto. Required for Better Auth
  // to mark cookies as Secure when the client used HTTPS but the origin saw HTTP.
  expressApp.set("trust proxy", 1);

  expressApp.use("/api/auth", authCorsMiddleware(allowedOrigins));

  // Block public sign-up. We can't use better-auth's disableSignUp because
  // that also blocks our server-side auth.api.signUpEmail calls (bootstrap
  // admin + /api/admin/users). Intercept the HTTP route here so external
  // callers get 403 but internal Node calls still work.
  expressApp.all("/api/auth/sign-up/*", (_req: Request, res: Response) => {
    res.status(403).json({ error: "Self-signup is disabled" });
  });

  expressApp.all("/api/auth/*", toNodeHandler(auth));

  // Capture raw body for GitHub webhook signature verification before any
  // body parser runs. Only applies to the webhook route.
  expressApp.use(
    "/api/github/webhooks",
    (req: Request & { rawBody?: Buffer; _body?: boolean; body?: unknown }, _res: Response, next: NextFunction) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const buf = Buffer.concat(chunks);
        req.rawBody = buf;
        try {
          req.body = buf.length > 0 ? JSON.parse(buf.toString()) : {};
        } catch {
          req.body = {};
        }
        // Express body-parser convention: skip if _body is already true.
        req._body = true;
        next();
      });
      req.on("error", next);
    },
  );

  // bodyParser is disabled for Better Auth; re-enable JSON parsing for Nest routes.
  app.useBodyParser("json");

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    exposedHeaders: ["Set-Cookie"],
  });

  const prisma = app.get(PRISMA);
  const deploymentQueue = app.get(getQueueToken("deployment"));

  const bootstrapLogger = new Logger("Bootstrap");
  try {
    await bootstrapSingleOrg(prisma, bootstrapLogger);
  } catch (err) {
    bootstrapLogger.error("Default-org bootstrap failed (continuing anyway):", err);
  }
  try {
    await bootstrapAdminUser(bootstrapLogger);
  } catch (err) {
    bootstrapLogger.error("Admin-user bootstrap failed (continuing anyway):", err);
  }
  try {
    await bootstrapGithubConnection(prisma, bootstrapLogger);
  } catch (err) {
    bootstrapLogger.error("GitHub-connection bootstrap failed (continuing anyway):", err);
  }

  try {
    await cleanupStaleDeployments(prisma, deploymentQueue);
    console.log("Stale-job cleanup complete");
  } catch (err) {
    console.error("Stale-job cleanup failed (continuing anyway):", err);
  }

  const port = env("PORT") ?? 3001;
  await app.listen(port);
  console.log(`Heizen API running on http://localhost:${port}`);

  app.enableShutdownHooks();

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, draining and closing...`);
    // Give in-flight HTTP requests up to 10s, then force-close.
    const force = setTimeout(() => {
      console.error("Forced exit after 10s");
      process.exit(1);
    }, 10_000);
    try {
      await app.close(); // closes Nest, which calls onModuleDestroy on BullMQ workers + Prisma
    } finally {
      clearTimeout(force);
      process.exit(0);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

bootstrap();
