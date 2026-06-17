import { Controller, Get, Inject } from "@nestjs/common";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";

@Controller()
export class HealthController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  // Liveness — process is up. Cheap; no I/O. Used by CI smoke tests
  // and load balancer healthchecks where a 200 is the only signal.
  @Get("health")
  health() {
    return { status: "ok" };
  }

  // Readiness — process is up AND can reach postgres. Used for
  // "is this container ready to serve traffic" gates.
  @Get("ready")
  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok", db: "ok" };
  }
}
