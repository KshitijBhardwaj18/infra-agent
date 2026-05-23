import { Module } from "@nestjs/common";
import { EventsGateway } from "./events.gateway";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class WebsocketModule {}
