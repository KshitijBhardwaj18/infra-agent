import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { GithubController } from "./github.controller";
import { GithubWebhookController } from "./github-webhook.controller";
import { GithubService } from "./github.service";
import { GithubTokenService } from "./github-token.service";
import { IndexingSseService } from "./indexing-sse.service";
import { ProjectsModule } from "../projects/projects.module";
import { WebsocketModule } from "../websocket/websocket.module";

@Module({
  imports: [
    ProjectsModule,
    WebsocketModule,
    BullModule.registerQueue({ name: "indexing" }),
  ],
  controllers: [GithubController, GithubWebhookController],
  providers: [GithubService, GithubTokenService, IndexingSseService],
  exports: [GithubService, GithubTokenService, IndexingSseService],
})
export class GithubModule {}
