import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Inject } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { auth } from "../auth/auth.config";
import { PRISMA } from "../prisma/prisma.module";
import { env } from "../common/env";
import type { PrismaClient } from "@heizen/db";
import type {
  DeploymentStatusPayload,
  EnvironmentStatusPayload,
  IndexingCompletePayload,
  GithubDisconnectedPayload,
} from "@heizen/shared";

@WebSocketGateway({
  cors: {
    origin: env("CORS_ORIGIN") ?? "http://localhost:3000",
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async handleConnection(client: Socket) {
    try {
      const cookie = client.handshake.headers.cookie ?? "";
      const session = await auth.api.getSession({
        headers: { cookie } as Record<string, string>,
      });

      if (!session?.user) {
        client.disconnect();
        return;
      }

      let orgId = session.session?.activeOrganizationId;

      if (!orgId) {
        const member = await this.prisma.member.findFirst({
          where: { userId: session.user.id },
          orderBy: { createdAt: "asc" },
        });
        orgId = member?.organizationId ?? null;
      }

      if (!orgId) {
        client.disconnect();
        return;
      }

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

  emitGithubDisconnected(orgId: string, payload: GithubDisconnectedPayload) {
    this.server.to(`org:${orgId}`).emit("github:disconnected", payload);
  }

  emitIncidentUpdate(
    orgId: string,
    payload: { environmentId: string; openCount: number },
  ) {
    this.server.to(`org:${orgId}`).emit("incident:update", payload);
  }
}
