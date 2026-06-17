import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module";
import { DeploymentsModule } from "../deployments/deployments.module";
import { ObservabilityModule } from "../observability/observability.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
  imports: [ProjectsModule, DeploymentsModule, ObservabilityModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
