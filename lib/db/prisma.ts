
import { PrismaClient } from "@prisma/client";

// Standard Next.js singleton pattern: in dev, hot-reloading would otherwise
// create a new PrismaClient (and a new DB connection pool) on every file
// change. We stash the instance on `globalThis` so it survives reloads.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
