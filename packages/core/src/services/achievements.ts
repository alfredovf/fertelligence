import { prisma } from "../db";
import { streakFrom } from "./attempts";

// Logros: premian la constancia, no las notas. Son opcionales (la escuela y cada alumno pueden ocultarlos).

export const ACHIEVEMENTS = {
  FIRST_SUBMISSION: { label: "Primera entrega", short: "1", description: "Entregaste tu primera tarea." },
  SUBMISSIONS_10: { label: "10 entregas", short: "10", description: "Ya entregaste 10 tareas." },
  SUBMISSIONS_25: { label: "25 entregas", short: "25", description: "Ya entregaste 25 tareas." },
  STREAK_5: { label: "5 días seguidos", short: "5d", description: "Entregaste tareas 5 días seguidos." },
  ON_TIME_5: { label: "5 a tiempo", short: "⏱", description: "Entregaste 5 tareas seguidas antes de la fecha." },
} as const;

export type AchievementKind = keyof typeof ACHIEVEMENTS;

// Se llama después de cada entrega. Devuelve los logros nuevos.
export async function awardAfterSubmit(studentId: string): Promise<AchievementKind[]> {
  const attempts = await prisma.attempt.findMany({
    where: { submittedAt: { not: null }, task: { assignment: { studentId } } },
    select: { submittedAt: true, late: true },
    orderBy: { submittedAt: "desc" },
  });
  const earned: AchievementKind[] = [];
  if (attempts.length >= 1) earned.push("FIRST_SUBMISSION");
  if (attempts.length >= 10) earned.push("SUBMISSIONS_10");
  if (attempts.length >= 25) earned.push("SUBMISSIONS_25");
  if (streakFrom(attempts.map((a) => a.submittedAt!)) >= 5) earned.push("STREAK_5");
  if (attempts.length >= 5 && attempts.slice(0, 5).every((a) => !a.late)) earned.push("ON_TIME_5");

  const existing = new Set((await prisma.achievement.findMany({ where: { studentId }, select: { kind: true } })).map((a) => a.kind));
  const fresh = earned.filter((k) => !existing.has(k));
  if (fresh.length) {
    await prisma.achievement.createMany({ data: fresh.map((kind) => ({ studentId, kind })), skipDuplicates: true });
    await prisma.notification.createMany({ data: fresh.map((kind) => ({ userId: studentId, kind: "achievement", payload: { kind } })) });
  }
  return fresh;
}

// Al arrancar el worker: otorga los logros que correspondan a entregas anteriores (es idempotente).
export async function backfillAchievements(): Promise<number> {
  const students = await prisma.user.findMany({
    where: { role: "STUDENT", studentAssignments: { some: { tasks: { some: { attempts: { some: { submittedAt: { not: null } } } } } } } },
    select: { id: true },
  });
  let awarded = 0;
  for (const s of students) awarded += (await awardAfterSubmit(s.id)).length;
  return awarded;
}
