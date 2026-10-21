import { getBoss, QUEUES } from "@fertelligence/core/queue";
import { prisma } from "@fertelligence/core/db";
import { sendEmail } from "@fertelligence/core/email/send";
import type { EmailMessage } from "@fertelligence/core/email/templates";
import { sendDueConsentReminders } from "@fertelligence/core/services/consent";

// Worker: procesa la cola de trabajos. Las próximas etapas suman IA, Classroom, PDF y el paso de tareas a Vencida.
async function main() {
  const boss = await getBoss();

  await boss.work(QUEUES.ping, async ([job]) => {
    return { pong: true, receivedAt: new Date().toISOString(), sentAt: (job?.data as { sentAt?: string })?.sentAt };
  });

  await boss.work<EmailMessage>(QUEUES.email, async ([job]) => {
    if (job) await sendEmail(job.data);
  });

  // Recordatorios de consentimiento: todos los días a las 9 (hora de Argentina)
  await boss.schedule(QUEUES.consentReminders, "0 9 * * *", {}, { tz: "America/Argentina/Buenos_Aires" });
  await boss.work(QUEUES.consentReminders, async () => {
    const sent = await sendDueConsentReminders();
    console.log(`[worker] Recordatorios de consentimiento enviados: ${sent}`);
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
