import { Module } from "@nestjs/common";
import { EnvVarsController } from "./env-vars.controller";
import { EnvVarsService } from "./env-vars.service";
import { EnvironmentsModule } from "../environments/environments.module";
import { EncryptionService } from "../common/services/encryption.service";

@Module({
  imports: [EnvironmentsModule],
  controllers: [EnvVarsController],
  providers: [EnvVarsService, EncryptionService],
  exports: [EnvVarsService],
})
export class EnvVarsModule {}
