import { PrismaClient } from "@prisma/client";

// Una sola instancia por proceso (en desarrollo, Next.js recarga módulos).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
