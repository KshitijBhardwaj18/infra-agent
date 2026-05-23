import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { auth } from "./auth/auth.config";
import { toNodeHandler } from "better-auth/node";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.all("/api/auth/*", toNodeHandler(auth));

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`Heizen API running on http://localhost:${port}`);
}

bootstrap();
