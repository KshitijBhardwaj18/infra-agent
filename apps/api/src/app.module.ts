import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { ProjectsModule } from "./projects/projects.module";
import { GithubModule } from "./github/github.module";
import { EnvironmentsModule } from "./environments/environments.module";
import { EnvVarsModule } from "./env-vars/env-vars.module";
import { DeploymentsModule } from "./deployments/deployments.module";
import { ResourcesModule } from "./resources/resources.module";
import { AgentModule } from "./agent/agent.module";
import { WorkersModule } from "./workers/workers.module";
import { WebsocketModule } from "./websocket/websocket.module";
import { EncryptionService } from "./common/services/encryption.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? "redis://localhost:6379",
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
    AgentModule,
    WorkersModule,
    WebsocketModule,
  ],
  providers: [EncryptionService],
})
export class AppModule {}
