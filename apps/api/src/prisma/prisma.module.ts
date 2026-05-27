import { Global, Module, Injectable, OnModuleDestroy } from "@nestjs/common";
import { prisma } from "@heizen/db";
import type { PrismaClient } from "@heizen/db";

export const PRISMA = "PRISMA";

@Injectable()
class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient = prisma;

  async onModuleDestroy() {
    await prisma.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: PRISMA,
      useFactory: (svc: PrismaService) => svc.client,
      inject: [PrismaService],
    },
  ],
  exports: [PRISMA],
})
export class PrismaModule {}
