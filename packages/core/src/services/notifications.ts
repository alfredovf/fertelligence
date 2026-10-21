import { prisma } from "../db";
import { emails } from "../email/templates";
import { env } from "../env";
import { enqueueEmail } from "../queue";

// Avisos por email a los alumnos: tareas nuevas y tareas que vencen mañana.
// Cada aviso se registra como notificación, así no se manda dos veces.

const dueFormat = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

// Agrupa por alumno las tareas que ya están disponibles (Nueva) y todavía no se avisaron.
export async function notifyNewTasks(): Promise<number> {
  const tasks = await prisma.task.findMany({
    where: { status: "NEW", currentAttempt: 0, assignment: { student: { status: "ACTIVE" } } },
    include: { template: { include: { subject: true } }, assignment: { include: { student: true } } },
  });
  const notified = new Set(
    (await prisma.notification.findMany({ where: { kind: "task.new", userId: { in: tasks.map((t) => t.assignment.studentId) } }, select: { payload: true } })).map((n) => (n.payload as { taskId?: string }).taskId),
  );
  const byStudent = new Map<string, typeof tasks>();
  for (const t of tasks) {
    if (notified.has(t.id)) continue;
    byStudent.set(t.assignment.studentId, [...(byStudent.get(t.assignment.studentId) ?? []), t]);
  }
  for (const [studentId, list] of byStudent) {
    const s = list[0]!.assignment.student;
    await prisma.notification.createMany({ data: list.map((t) => ({ userId: studentId, kind: "task.new", payload: { taskId: t.id, title: t.template.title } })) });
    await enqueueEmail(emails.newTasks({ to: s.email, name: s.firstName, tasks: list.map((t) => ({ title: t.template.title, subject: t.template.subject.name, due: dueFormat.format(t.dueAt) })), url: `${env.appUrl}/alumno` }));
  }
  return byStudent.size;
}

// Tareas sin entregar que vencen en las próximas 24 horas.
export async function remindDueSoon(now = new Date()): Promise<number> {
  const tasks = await prisma.task.findMany({
    where: { status: { in: ["NEW", "IN_PROGRESS", "REDO"] }, dueAt: { gt: now, lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) }, assignment: { student: { status: "ACTIVE" } } },
    include: { template: true, assignment: { include: { student: true } } },
  });
  let sent = 0;
  for (const t of tasks) {
    const already = await prisma.notification.count({ where: { userId: t.assignment.studentId, kind: "task.due_soon", payload: { path: ["taskId"], equals: t.id } } });
    if (already) continue;
    const s = t.assignment.student;
    await prisma.notification.create({ data: { userId: s.id, kind: "task.due_soon", payload: { taskId: t.id, title: t.template.title } } });
    await enqueueEmail(emails.dueSoon({ to: s.email, name: s.firstName, title: t.template.title, due: dueFormat.format(t.dueAt), url: `${env.appUrl}/alumno/tareas/${t.id}` }));
    sent++;
  }
  return sent;
}
