import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { auth } from "../auth/auth.config";
import type {
  DeploymentStatusPayload,
  EnvironmentStatusPayload,
  IndexingCompletePayload,
} from "@heizen/shared";

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  async handleConnection(client: Socket) {
    try {
      const cookie = client.handshake.headers.cookie ?? "";
      const session = await auth.api.getSession({
        headers: { cookie } as Record<string, string>,
      });

      if (!session?.session?.activeOrganizationId) {
        client.disconnect();
        return;
      }

      const orgId = session.session.activeOrganizationId;
      client.join(`org:${orgId}`);
      (client as Socket & { orgId?: string }).orgId = orgId;
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket) {}

  emitDeploymentStatus(orgId: string, payload: DeploymentStatusPayload) {
    this.server.to(`org:${orgId}`).emit("deployment:status", payload);
  }

  emitEnvironmentStatus(orgId: string, payload: EnvironmentStatusPayload) {
    this.server.to(`org:${orgId}`).emit("environment:status", payload);
  }

  emitIndexingComplete(orgId: string, payload: IndexingCompletePayload) {
    this.server.to(`org:${orgId}`).emit("indexing:complete", payload);
  }
}
