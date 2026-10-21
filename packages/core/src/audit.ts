import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";

type Db = PrismaClient | Prisma.TransactionClient;

export type AuditEntry = {
  actorId?: string | null;
  onBehalfOfId?: string | null;
  action: string; // por ejemplo "user.create", "assignment.update", "consent.grant"
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

const json = (value: unknown) => (value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue));

// Registro de auditoría: nunca se modifica ni se borra.
export async function audit(entry: AuditEntry, db: Db = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      onBehalfOfId: entry.onBehalfOfId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: json(entry.before),
      after: json(entry.after),
    },
  });
}
