import PgBoss from "pg-boss";
import type { EmailMessage } from "./email/templates";
import { env } from "./env";

// Nombres de las colas. El worker las procesa; la web solo encola.
export const QUEUES = {
  ping: "system.ping",
  email: "email.send",
  consentReminders: "consent.reminders",
  taskTick: "tasks.tick",
  dueSoon: "tasks.due_soon",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

const globalForBoss = globalThis as unknown as { boss?: Promise<PgBoss> };

async function startBoss(): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: env.databaseUrl, schema: "pgboss" });
  boss.on("error", (error) => console.error("[queue]", error));
  await boss.start();
  for (const name of Object.values(QUEUES)) {
    await boss.createQueue(name);
  }
  return boss;
}

export function getBoss(): Promise<PgBoss> {
  globalForBoss.boss ??= startBoss().catch((error) => {
    globalForBoss.boss = undefined;
    throw error;
  });
  return globalForBoss.boss;
}

// Encola un email; el worker lo envía con reintentos.
export async function enqueueEmail(message: EmailMessage): Promise<void> {
  const boss = await getBoss();
  await boss.send(QUEUES.email, message, { retryLimit: 5, retryDelay: 30, retryBackoff: true });
}
