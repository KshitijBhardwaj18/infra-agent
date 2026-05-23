import { Module } from "@nestjs/common";
import { ResourcesController } from "./resources.controller";
import { ResourcesService } from "./resources.service";
import { EnvironmentsModule } from "../environments/environments.module";

@Module({
  imports: [EnvironmentsModule],
  controllers: [ResourcesController],
  providers: [ResourcesService],
})
export class ResourcesModule {}
