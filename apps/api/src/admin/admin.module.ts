import { Module } from "@nestjs/common";
import { AdminUsersController } from "./admin-users.controller";
import { AdminProjectsController } from "./admin-projects.controller";

@Module({
  controllers: [AdminUsersController, AdminProjectsController],
})
export class AdminModule {}
