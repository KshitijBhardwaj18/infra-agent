import "reflect-metadata";
import type { Request, Response, NextFunction } from "express";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { prisma } from "@heizen/db";
import { AppModule } from "./app.module";
import { auth } from "./auth/auth.config";
import { toNodeHandler } from "better-auth/node";
import { cleanStaleTempDirs } from "./common/clean-stale-temp-dirs";

const DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

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
  await cleanStaleTempDirs();

  const allowedOrigins = getAllowedOrigins();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use("/api/auth", authCorsMiddleware(allowedOrigins));

  // When GitHub App has "Request user authorization" enabled, GitHub sends
  // installation_id to the OAuth callback. Read projectId from the cookie set
  // in ConnectGitHub, save installationId, and redirect — do not forward GitHub's
  // internal OAuth state to /api/github/callback.
  expressApp.get(
    "/api/auth/callback/github",
    async (req: Request, res: Response, next: NextFunction) => {
      const installationId = req.query.installation_id as string | undefined;
      if (!installationId) {
        next();
        return;
      }

      const rawCookie = req.headers.cookie ?? "";
      const projectMatch = /heizen_pending_project=([^;]+)/.exec(rawCookie);
      const projectId = projectMatch?.[1]?.trim();
      const envMatch = /heizen_pending_env=([^;]+)/.exec(rawCookie);
      const returnEnv = envMatch?.[1]?.trim() ?? "staging";

      const origin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

      if (!projectId) {
        next();
        return;
      }

      try {
        await prisma.project.update({
          where: { id: projectId },
          data: { githubInstallationId: installationId },
        });
      } catch (err) {
        console.error("Failed to save GitHub installationId:", err);
      }

      res.setHeader("Set-Cookie", [
        "heizen_pending_project=; path=/; max-age=0; SameSite=Lax",
        "heizen_pending_env=; path=/; max-age=0; SameSite=Lax",
      ]);

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { slug: true },
      });

      const redirect = project?.slug
        ? `${origin}/projects/${project.slug}/${returnEnv}`
        : `${origin}/dashboard`;

      res.redirect(redirect);
    },
  );

  expressApp.all("/api/auth/*", toNodeHandler(auth));
  // bodyParser is disabled for Better Auth; re-enable JSON parsing for Nest routes.
  app.useBodyParser("json");

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    exposedHeaders: ["Set-Cookie"],
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`Heizen API running on http://localhost:${port}`);
}

bootstrap();
