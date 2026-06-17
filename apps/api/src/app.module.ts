import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { env } from "./common/env";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { ProjectsModule } from "./projects/projects.module";
import { GithubModule } from "./github/github.module";
import { EnvironmentsModule } from "./environments/environments.module";
import { EnvVarsModule } from "./env-vars/env-vars.module";
import { DeploymentsModule } from "./deployments/deployments.module";
import { ResourcesModule } from "./resources/resources.module";
import { WorkersModule } from "./workers/workers.module";
import { WebsocketModule } from "./websocket/websocket.module";
import { MeModule } from "./me/me.module";
import { AdminModule } from "./admin/admin.module";
import { AuditModule } from "./audit/audit.module";
import { ObservabilityModule } from "./observability/observability.module";
import { DataSourcesModule } from "./data-sources/data-sources.module";
import { ChatModule } from "./chat/chat.module";
import { EncryptionService } from "./common/services/encryption.service";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        url: env("REDIS_URL") ?? "redis://localhost:6379",
      },
    }),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    ProjectsModule,
    GithubModule,
    EnvironmentsModule,
    EnvVarsModule,
    DeploymentsModule,
    ResourcesModule,
    WorkersModule,
    WebsocketModule,
    MeModule,
    AdminModule,
    AuditModule,
    ObservabilityModule,
    DataSourcesModule,
    ChatModule,
  ],
  controllers: [HealthController],
  providers: [EncryptionService],
})
export class AppModule {}
