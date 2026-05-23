import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __heizenPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__heizenPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["error", "warn"]
        : ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__heizenPrisma = prisma;
}

export * from "@prisma/client";
export { Prisma } from "@prisma/client";
