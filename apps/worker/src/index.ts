import { getBoss, QUEUES } from "@fertelligence/core/queue";
import { prisma } from "@fertelligence/core/db";
import { sendEmail } from "@fertelligence/core/email/send";
import type { EmailMessage } from "@fertelligence/core/email/templates";
import { sendDueConsentReminders } from "@fertelligence/core/services/consent";
import { tickTaskStatuses } from "@fertelligence/core/services/tasks";
import { notifyNewTasks, remindDueSoon } from "@fertelligence/core/services/notifications";
import { runAiJob } from "@fertelligence/core/services/ai";

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

  // Estados por fecha: Programada → Nueva al llegar el inicio; Nueva o En progreso → Vencida al pasar la entrega
  await boss.schedule(QUEUES.taskTick, "*/5 * * * *", {}, { tz: "America/Argentina/Buenos_Aires" });
  await boss.work(QUEUES.taskTick, async () => {
    const { opened, overdue } = await tickTaskStatuses();
    if (opened || overdue) console.log(`[worker] Tareas disponibles: ${opened} · vencidas: ${overdue}`);
    const students = await notifyNewTasks();
    if (students) console.log(`[worker] Avisos de tareas nuevas a ${students} alumnos`);
  });

  // Creación de tareas con IA (Gemini): hasta 2 a la vez
  await boss.work<{ jobId: string }>(QUEUES.ai, { batchSize: 2, pollingIntervalSeconds: 1 }, async (jobs) => {
    await Promise.all(jobs.map((job) => runAiJob(job.data.jobId)));
  });

  // Recordatorio de vencimiento: todos los días a las 18, para lo que vence en las próximas 24 horas
  await boss.schedule(QUEUES.dueSoon, "0 18 * * *", {}, { tz: "America/Argentina/Buenos_Aires" });
  await boss.work(QUEUES.dueSoon, async () => {
    const sent = await remindDueSoon();
    console.log(`[worker] Recordatorios de vencimiento: ${sent}`);
  });
  await tickTaskStatuses(); // al arrancar, para no esperar al primer ciclo

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
