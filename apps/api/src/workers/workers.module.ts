import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { IndexingProcessor } from "./indexing.processor";
import { DeploymentProcessor } from "./deployment.processor";
import { GithubModule } from "../github/github.module";
import { DeploymentsModule } from "../deployments/deployments.module";
import { EnvVarsModule } from "../env-vars/env-vars.module";
import { WebsocketModule } from "../websocket/websocket.module";
import { EncryptionService } from "../common/services/encryption.service";

@Module({
  imports: [
    BullModule.registerQueue({ name: "indexing" }),
    BullModule.registerQueue({ name: "deployment" }),
    GithubModule,
    DeploymentsModule,
    EnvVarsModule,
    WebsocketModule,
  ],
  providers: [IndexingProcessor, DeploymentProcessor, EncryptionService],
})
export class WorkersModule {}
