import "reflect-metadata";
import type { Request, Response, NextFunction } from "express";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { getQueueToken } from "@nestjs/bullmq";
import { AppModule } from "./app.module";
import { auth } from "./auth/auth.config";
import { toNodeHandler } from "better-auth/node";
import { cleanStaleTempDirs } from "./common/clean-stale-temp-dirs";
import { cleanupStaleDeployments, cleanupStaleIndexingJobs } from "./common/cleanup-stale-jobs";
import { PRISMA } from "./prisma/prisma.module";

const DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

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
  const missing = REQUIRED_PRODUCTION_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`FATAL: missing required production env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
}

function getAllowedOrigins(): string[] {
  const fromEnv = process.env.CORS_ORIGIN;
  const origins = fromEnv ? [fromEnv, ...DEFAULT_ORIGINS] : DEFAULT_ORIGINS;
  return [...new Set(origins)];
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

  await cleanStaleTempDirs();

  const allowedOrigins = getAllowedOrigins();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use("/api/auth", authCorsMiddleware(allowedOrigins));

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
  const indexingQueue = app.get(getQueueToken("indexing"));

  try {
    await cleanupStaleDeployments(prisma, deploymentQueue);
    await cleanupStaleIndexingJobs(indexingQueue);
    console.log("Stale-job cleanup complete");
  } catch (err) {
    console.error("Stale-job cleanup failed (continuing anyway):", err);
  }

  const port = process.env.PORT ?? 3001;
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
