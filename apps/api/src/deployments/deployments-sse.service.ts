import { Injectable, OnModuleDestroy, Inject } from "@nestjs/common";
import { Subject, type Observable } from "rxjs";
import Redis from "ioredis";
import type { DeploymentPhase } from "@heizen/db";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";
import type { DeploymentLogPayload } from "@heizen/shared";
import { env } from "../common/env";

@Injectable()
export class DeploymentsSseService implements OnModuleDestroy {
  private readonly subjects = new Map<string, Subject<DeploymentLogPayload>>();
  private readonly redis: Redis;
  private readonly subscriber: Redis;

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {
    const url = env("REDIS_URL") ?? "redis://localhost:6379";
    this.redis = new Redis(url);
    this.subscriber = new Redis(url);

    this.subscriber.subscribe("deployment:logs");
    this.subscriber.on("message", (_channel, message) => {
      const { deploymentId, payload } = JSON.parse(message) as {
        deploymentId: string;
        payload: DeploymentLogPayload;
      };
      this.getSubject(deploymentId).next(payload);
    });
  }

  getSubject(deploymentId: string): Subject<DeploymentLogPayload> {
    if (!this.subjects.has(deploymentId)) {
      this.subjects.set(deploymentId, new Subject<DeploymentLogPayload>());
    }
    return this.subjects.get(deploymentId)!;
  }

  stream(deploymentId: string): Observable<DeploymentLogPayload> {
    return this.getSubject(deploymentId).asObservable();
  }

  /**
   * Complete and remove the subject for a deploymentId once the deployment
   * finishes (success, failure, or timeout). Called by the deployment
   * worker's finally block so subjects don't accumulate indefinitely.
   * NestJS @Sse unsubscribes when the client disconnects, but the Subject
   * itself would linger until this is called.
   */
  cleanup(deploymentId: string): void {
    const subject = this.subjects.get(deploymentId);
    if (subject) {
      subject.complete();
      this.subjects.delete(deploymentId);
    }
  }

  async logAndEmit(
    deploymentId: string,
    phase: DeploymentPhase,
    level: string,
    message: string,
  ): Promise<void> {
    const payload: DeploymentLogPayload = { phase, level, message };

    await this.prisma.deploymentLog.create({
      data: { deploymentId, phase, level, message },
    });

    this.getSubject(deploymentId).next(payload);
    await this.redis.publish(
      "deployment:logs",
      JSON.stringify({ deploymentId, payload }),
    );
  }

  onModuleDestroy() {
    this.redis.disconnect();
    this.subscriber.disconnect();
  }
}
