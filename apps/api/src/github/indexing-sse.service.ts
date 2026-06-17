import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Subject, type Observable } from "rxjs";
import Redis from "ioredis";
import type { IndexingSsePayload } from "@heizen/shared";
import { env } from "../common/env";

@Injectable()
export class IndexingSseService implements OnModuleDestroy {
  private readonly subjects = new Map<string, Subject<IndexingSsePayload>>();
  private readonly redis: Redis;
  private readonly subscriber: Redis;

  constructor() {
    const url = env("REDIS_URL") ?? "redis://localhost:6379";
    this.redis = new Redis(url);
    this.subscriber = new Redis(url);

    this.subscriber.subscribe("indexing:sse");
    this.subscriber.on("message", (_channel, message) => {
      const { projectId, payload } = JSON.parse(message) as {
        projectId: string;
        payload: IndexingSsePayload;
      };
      this.getSubject(projectId).next(payload);
    });
  }

  getSubject(projectId: string): Subject<IndexingSsePayload> {
    if (!this.subjects.has(projectId)) {
      this.subjects.set(projectId, new Subject<IndexingSsePayload>());
    }
    return this.subjects.get(projectId)!;
  }

  stream(projectId: string): Observable<IndexingSsePayload> {
    return this.getSubject(projectId).asObservable();
  }

  emit(projectId: string, payload: IndexingSsePayload): void {
    this.getSubject(projectId).next(payload);
    this.redis.publish(
      "indexing:sse",
      JSON.stringify({ projectId, payload }),
    );
  }

  /**
   * Complete and remove the subject for a projectId once indexing finishes
   * (success or failure). Called by the indexing worker's finally block so
   * subjects don't accumulate indefinitely. NestJS @Sse unsubscribes when the
   * client disconnects, but the Subject itself would linger until this is
   * called.
   */
  cleanup(projectId: string): void {
    const subject = this.subjects.get(projectId);
    if (subject) {
      subject.complete();
      this.subjects.delete(projectId);
    }
  }

  onModuleDestroy() {
    this.redis.disconnect();
    this.subscriber.disconnect();
  }
}
