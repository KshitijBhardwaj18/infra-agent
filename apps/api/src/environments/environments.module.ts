import { Module } from "@nestjs/common";
import { EnvironmentsController } from "./environments.controller";
import { EnvironmentsService } from "./environments.service";
import { ProjectsModule } from "../projects/projects.module";

@Module({
  imports: [ProjectsModule],
  controllers: [EnvironmentsController],
  providers: [EnvironmentsService],
  exports: [EnvironmentsService],
})
export class EnvironmentsModule {}
