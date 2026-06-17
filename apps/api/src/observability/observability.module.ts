import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { EnvironmentsModule } from "../environments/environments.module";
import { WebsocketModule } from "../websocket/websocket.module";
import { DataSourcesModule } from "../data-sources/data-sources.module";
import { IncidentsController } from "./incidents.controller";
import { OpsController } from "./ops.controller";
import { LogsController } from "./logs.controller";
import { SourcesController } from "./sources.controller";
import { IncidentsService } from "./incidents.service";
import { ObservabilityService } from "./observability.service";
import { IncidentAnalysisService } from "./incident-analysis.service";
import { VmExecService } from "./vm-exec.service";
import { LogsService } from "./logs.service";
import { LogAnalysisService } from "./log-analysis.service";
import { CloudWatchMetricsService } from "./cloudwatch-metrics.service";
import { SourcesService } from "./sources.service";
import { MonitoringProcessor, MONITORING_QUEUE } from "./monitoring.processor";

@Module({
  imports: [
    BullModule.registerQueue({ name: MONITORING_QUEUE }),
    EnvironmentsModule,
    WebsocketModule,
    DataSourcesModule,
  ],
  controllers: [
    IncidentsController,
    OpsController,
    LogsController,
    SourcesController,
  ],
  providers: [
    IncidentsService,
    ObservabilityService,
    IncidentAnalysisService,
    VmExecService,
    LogsService,
    LogAnalysisService,
    CloudWatchMetricsService,
    SourcesService,
    MonitoringProcessor,
  ],
  // Consumed by the chat agent (incidents/scan/analysis/logs/restart
  // tools) and the deployment worker (deploy-failure incidents).
  exports: [
    IncidentsService,
    ObservabilityService,
    IncidentAnalysisService,
    VmExecService,
    LogsService,
    LogAnalysisService,
  ],
})
export class ObservabilityModule {}
