import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __heizenPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__heizenPrisma ??
  new PrismaClient({
    // Opt into query logs with PRISMA_LOG_QUERIES=1. Off by default in
    // every env — they're noisy and obscure real log lines like the
    // GitHub callback path.
    log:
      process.env.PRISMA_LOG_QUERIES === "1"
        ? ["query", "error", "warn"]
        : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__heizenPrisma = prisma;
}

export * from "@prisma/client";
export { Prisma } from "@prisma/client";
