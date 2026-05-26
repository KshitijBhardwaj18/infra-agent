import "reflect-metadata";
import type { Request, Response, NextFunction } from "express";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
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
