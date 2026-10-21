import { getBoss, QUEUES } from "@fertelligence/core/queue";
import { prisma } from "@fertelligence/core/db";

// Worker: procesa la cola de trabajos. En la etapa 0 solo atiende el ping de diagnóstico;
// las próximas etapas suman IA, Classroom, emails, PDF y el paso de tareas a Vencida.
async function main() {
  const boss = await getBoss();

  await boss.work(QUEUES.ping, async ([job]) => {
    return { pong: true, receivedAt: new Date().toISOString(), sentAt: (job?.data as { sentAt?: string })?.sentAt };
  });

  console.log(`[worker] Escuchando: ${Object.values(QUEUES).join(", ")}`);

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal}: cerrando`);
    await boss.stop({ graceful: true, timeout: 10_000 });
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("[worker] No pudo arrancar:", error);
  process.exit(1);
});
