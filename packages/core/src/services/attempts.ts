import { Prisma, type TaskStatus } from "@prisma/client";
import { z } from "zod";
import { audit } from "../audit";
import { prisma } from "../db";
import { scoreItem } from "../grading";
import { taskTypeSchemas, type TaskTypeName } from "../task-types";
import { readSettings } from "./tasks";

// Lo que hace el alumno: empezar (o retomar) un intento, responder con guardado automático y entregar.

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

const VISIBLE: TaskStatus[] = ["NEW", "IN_PROGRESS", "OVERDUE", "COMPLETED", "CORRECTED", "REDO"];
const OPEN: TaskStatus[] = ["NEW", "IN_PROGRESS", "OVERDUE", "REDO"];
const DAY = 24 * 60 * 60 * 1000;

export async function loadStudentTask(studentId: string, taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      template: { include: { items: { orderBy: { position: "asc" } }, subject: true } },
      assignment: { include: { teacher: { select: { firstName: true, lastName: true } } } },
      attempts: { orderBy: { number: "desc" }, include: { answers: true, result: true } },
    },
  });
  if (!task || task.assignment.studentId !== studentId || !VISIBLE.includes(task.status)) return null;
  return task;
}

export type StudentTask = NonNullable<Awaited<ReturnType<typeof loadStudentTask>>>;

export function currentAttempt(task: StudentTask) {
  return task.attempts.find((a) => a.number === task.currentAttempt) ?? null;
}

export function isOpen(status: TaskStatus) {
  return OPEN.includes(status);
}

// Si la respuesta tiene algo cargado. "Tachar" cuenta como respondida apenas se guarda (no tachar nada es válido).
export function isAnswered(type: TaskTypeName, content: unknown, response: unknown): boolean {
  if (response === null || response === undefined) return false;
  const r = response as Record<string, unknown>;
  switch (type) {
    case "MULTIPLE_CHOICE":
      return Array.isArray(r.optionIds) && r.optionIds.length > 0;
    case "TRUE_FALSE":
      return typeof r.value === "boolean";
    case "MATCHING":
      return Array.isArray(r.pairs) && r.pairs.length === ((content as { left?: unknown[] }).left?.length ?? 0);
    case "FILL_BLANKS": {
      const blanks = (content as { blanks?: { id: string }[] }).blanks ?? [];
      const answers = (r.answers ?? {}) as Record<string, string>;
      return blanks.every((b) => (answers[b.id] ?? "").trim() !== "");
    }
    case "STRIKE_OUT":
      return Array.isArray(r.strikeIds);
  }
}

// Empieza un intento o retoma el que está abierto. Al rehacer "solo incorrectos", copia los ítems que estaban bien.
export async function startOrResume(studentId: string, taskId: string): Promise<Result<{ attemptId: string }>> {
  const task = await loadStudentTask(studentId, taskId);
  if (!task) return fail("No encontramos la tarea.");
  const open = currentAttempt(task);
  if (open && !open.submittedAt) return ok({ attemptId: open.id });
  if (!isOpen(task.status)) return fail("Esta tarea ya fue entregada.");

  const number = task.currentAttempt + 1;
  const previous = open; // el intento anterior, ya entregado (solo existe al rehacer)
  const settings = readSettings(task.template.settings);
  const carry =
    previous?.result?.redoRequested && settings.redoScope === "INCORRECT_ONLY"
      ? previous.answers.filter((a) => {
          const item = task.template.items.find((i) => i.id === a.itemId);
          return item && a.finalPoints !== null && Number(a.finalPoints) >= Number(item.maxPoints);
        })
      : [];

  const attempt = await prisma.$transaction(async (tx) => {
    const created = await tx.attempt.create({ data: { taskId, number } });
    if (carry.length) {
      await tx.answer.createMany({
        data: carry.map((a) => ({
          attemptId: created.id,
          itemId: a.itemId,
          response: a.response ?? Prisma.JsonNull,
          autoPoints: a.finalPoints,
          finalPoints: a.finalPoints,
          carriedOver: true,
        })),
      });
    }
    await tx.task.update({ where: { id: taskId }, data: { currentAttempt: number, status: task.status === "OVERDUE" ? "OVERDUE" : "IN_PROGRESS" } });
    return created;
  });
  await audit({ actorId: studentId, action: "attempt.start", entity: "task", entityId: taskId, after: { number, carried: carry.length } });
  return ok({ attemptId: attempt.id });
}

// Guarda la respuesta de un ítem en el intento abierto.
export async function saveAnswer(studentId: string, taskId: string, itemId: string, response: unknown): Promise<Result> {
  const task = await loadStudentTask(studentId, taskId);
  if (!task) return fail("No encontramos la tarea.");
  const attempt = currentAttempt(task);
  if (!attempt || attempt.submittedAt) return fail("La tarea ya fue entregada.");
  const item = task.template.items.find((i) => i.id === itemId);
  if (!item) return fail("No encontramos la pregunta.");
  const existing = attempt.answers.find((a) => a.itemId === itemId);
  if (existing?.carriedOver) return fail("Esta pregunta ya estaba bien: no hace falta rehacerla.");
  const parsed = taskTypeSchemas[task.template.type as TaskTypeName].response.safeParse(response);
  if (!parsed.success) return fail("La respuesta no tiene el formato esperado.");
  await prisma.answer.upsert({
    where: { attemptId_itemId: { attemptId: attempt.id, itemId } },
    create: { attemptId: attempt.id, itemId, response: parsed.data as Prisma.InputJsonValue },
    update: { response: parsed.data as Prisma.InputJsonValue },
  });
  return ok(undefined);
}

// Entrega: marca fuera de término si corresponde y calcula la precorrección automática (sugerencia para el docente).
export async function submitAttempt(studentId: string, taskId: string, now = new Date()): Promise<Result<{ late: boolean }>> {
  const task = await loadStudentTask(studentId, taskId);
  if (!task) return fail("No encontramos la tarea.");
  const attempt = currentAttempt(task);
  if (!attempt || attempt.submittedAt) return fail("La tarea ya fue entregada.");
  const type = task.template.type as TaskTypeName;
  const late = now > task.dueAt;
  const lateDays = late ? Math.ceil((now.getTime() - task.dueAt.getTime()) / DAY) : 0;

  await prisma.$transaction(async (tx) => {
    for (const item of task.template.items) {
      const answer = attempt.answers.find((a) => a.itemId === item.id);
      if (answer?.carriedOver) continue;
      const score = scoreItem(type, item.content, item.correctAnswer, answer?.response ?? null, Number(item.maxPoints));
      await tx.answer.upsert({
        where: { attemptId_itemId: { attemptId: attempt.id, itemId: item.id } },
        create: { attemptId: attempt.id, itemId: item.id, response: Prisma.JsonNull, autoPoints: score.points },
        update: { autoPoints: score.points },
      });
    }
    await tx.attempt.update({ where: { id: attempt.id }, data: { submittedAt: now, late, lateDays } });
    await tx.task.update({ where: { id: taskId }, data: { status: "COMPLETED" } });
    const teacherId = task.assignment.teacherId;
    await tx.notification.create({ data: { userId: teacherId, kind: "task.submitted", payload: { taskId, templateId: task.templateId, title: task.template.title, late, studentId } } });
  });
  await audit({ actorId: studentId, action: "attempt.submit", entity: "task", entityId: taskId, after: { number: attempt.number, late, lateDays } });
  // Logros (import diferido para evitar una dependencia circular con achievements.ts)
  const { awardAfterSubmit } = await import("./achievements");
  await awardAfterSubmit(studentId);
  return ok({ late });
}

// ---------- Progreso del alumno ----------

const argDay = (d: Date) => new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

// Racha: días seguidos (hora de Argentina) con al menos una entrega, contando hasta hoy o ayer.
export function streakFrom(submissions: Date[], now = new Date()): number {
  const days = new Set(submissions.map(argDay));
  let cursor = new Date(now);
  if (!days.has(argDay(cursor))) cursor = new Date(cursor.getTime() - DAY);
  let streak = 0;
  while (days.has(argDay(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - DAY);
  }
  return streak;
}

export async function studentProgress(studentId: string) {
  const attempts = await prisma.attempt.findMany({
    where: { submittedAt: { not: null }, task: { assignment: { studentId } } },
    select: { submittedAt: true, late: true, task: { select: { assignment: { select: { subject: { select: { name: true, color: true } } } } } } },
  });
  const submitted = attempts.length;
  const onTime = attempts.filter((a) => !a.late).length;
  const monthStart = new Date(new Date().toISOString().slice(0, 7) + "-01T03:00:00Z");
  return {
    streak: streakFrom(attempts.map((a) => a.submittedAt!)),
    submitted,
    submittedThisMonth: attempts.filter((a) => a.submittedAt! >= monthStart).length,
    onTimePercent: submitted ? Math.round((onTime / submitted) * 100) : null,
  };
}

export const studentPreferences = z.object({
  fontSize: z.enum(["normal", "large", "xlarge"]).default("normal"),
  autoRead: z.boolean().default(false),
  pauseReminders: z.boolean().default(true),
  showTimer: z.boolean().default(false),
  showAchievements: z.boolean().default(true),
  reduceMotion: z.boolean().default(false),
});
export type StudentPreferences = z.infer<typeof studentPreferences>;

export function readPreferences(value: unknown): StudentPreferences {
  const parsed = studentPreferences.safeParse(value ?? {});
  return parsed.success ? parsed.data : studentPreferences.parse({});
}
