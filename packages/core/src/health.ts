import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { prisma } from "./db";
import { env } from "./env";
import { getBoss, QUEUES } from "./queue";
import { getStorage } from "./storage";

export type Check = { ok: boolean; detail: string };

async function timed(fn: () => Promise<string>): Promise<Check> {
  const start = Date.now();
  try {
    const detail = await fn();
    return { ok: true, detail: `${detail} · ${Date.now() - start} ms` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export function checkDatabase(): Promise<Check> {
  return timed(async () => {
    const [row] = await prisma.$queryRaw<{ version: string }[]>`SELECT current_setting('server_version') AS version`;
    return `PostgreSQL ${row?.version ?? "?"}`;
  });
}

export function checkStorage(): Promise<Check> {
  return timed(async () => {
    await getStorage().send(new HeadBucketCommand({ Bucket: env.storage.bucket }));
    return `Bucket "${env.storage.bucket}" disponible`;
  });
}

// Encola un ping y espera a que el worker lo complete.
export function checkQueue(timeoutMs = 5000): Promise<Check> {
  return timed(async () => {
    const boss = await getBoss();
    const id = await boss.send(QUEUES.ping, { sentAt: new Date().toISOString() });
    if (!id) throw new Error("No se pudo encolar el ping");
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const job = await boss.getJobById(QUEUES.ping, id);
      if (job?.state === "completed") return "El worker respondió";
      if (job?.state === "failed") throw new Error("El worker falló al procesar el ping");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("El worker no respondió en 5 segundos");
  });
}
