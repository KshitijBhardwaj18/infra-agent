import { Module } from "@nestjs/common";
import { EnvironmentsModule } from "../environments/environments.module";
import { EncryptionService } from "../common/services/encryption.service";
import { DataSourcesController } from "./data-sources.controller";
import { DataSourcesService } from "./data-sources.service";

@Module({
  imports: [EnvironmentsModule],
  controllers: [DataSourcesController],
  providers: [DataSourcesService, EncryptionService],
  // Source readers (logs/metrics) consume connections in follow-up work.
  exports: [DataSourcesService],
})
export class DataSourcesModule {}
