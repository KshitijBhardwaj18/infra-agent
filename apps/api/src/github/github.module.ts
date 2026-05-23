import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { GithubController } from "./github.controller";
import { GithubService } from "./github.service";
import { GithubTokenService } from "./github-token.service";
import { IndexingSseService } from "./indexing-sse.service";
import { ProjectsModule } from "../projects/projects.module";

@Module({
  imports: [
    ProjectsModule,
    BullModule.registerQueue({ name: "indexing" }),
  ],
  controllers: [GithubController],
  providers: [GithubService, GithubTokenService, IndexingSseService],
  exports: [GithubService, GithubTokenService, IndexingSseService],
})
export class GithubModule {}
