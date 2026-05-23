import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { DeploymentsController } from "./deployments.controller";
import { DeploymentsService } from "./deployments.service";
import { DeploymentsSseService } from "./deployments-sse.service";
import { EnvironmentsModule } from "../environments/environments.module";

@Module({
  imports: [
    EnvironmentsModule,
    BullModule.registerQueue({ name: "deployment" }),
  ],
  controllers: [DeploymentsController],
  providers: [DeploymentsService, DeploymentsSseService],
  exports: [DeploymentsService, DeploymentsSseService],
})
export class DeploymentsModule {}
