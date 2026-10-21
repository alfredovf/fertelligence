import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "../audit";
import type { SessionUser } from "../auth/session";
import { prisma } from "../db";
import { emails } from "../email/templates";
import { env } from "../env";
import { isPassing, suggestedGrade } from "../grading";
import type { TaskTypeName } from "../task-types";
import { enqueueEmail } from "../queue";

// Corrección: el docente revisa la precorrección, ajusta lo que haga falta y aprueba.
// Aprobar es lo único que pasa una tarea de Completada a Corregida (o a Para rehacer).

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

const round2 = (n: number) => Math.round(n * 100) / 100;

// Un ítem necesita revisión del docente si tiene justificación para corregir.
export function needsReview(type: TaskTypeName, content: unknown): boolean {
  return type === "TRUE_FALSE" && Boolean((content as { requireJustification?: boolean }).requireJustification);
}

const submissionInclude = {
  template: { include: { items: { orderBy: { position: "asc" } }, subject: true } },
  assignment: { include: { student: { select: { id: true, firstName: true, lastName: true, email: true } }, teacher: { select: { id: true, firstName: true, lastName: true } } } },
  attempts: { orderBy: { number: "desc" }, include: { answers: true, result: true } },
} satisfies Prisma.TaskInclude;

// El docente de la asignación puede corregir; un administrador también (en su nombre).
export async function loadSubmission(user: SessionUser, taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: submissionInclude });
  if (!task) return null;
  if (user.role !== "ADMIN" && !(user.role === "TEACHER" && task.assignment.teacherId === user.id)) return null;
  const attempt = task.attempts.find((a) => a.number === task.currentAttempt) ?? null;
  return { task, attempt };
}

export type Submission = NonNullable<Awaited<ReturnType<typeof loadSubmission>>>;

// Bandeja: entregas esperando corrección, la más antigua primero.
export async function correctionQueue(teacherId: string | null) {
  const tasks = await prisma.task.findMany({
    where: { status: "COMPLETED", ...(teacherId ? { assignment: { teacherId } } : {}) },
    include: submissionInclude,
  });
  return tasks
    .map((task) => {
      const attempt = task.attempts.find((a) => a.number === task.currentAttempt)!;
      const type = task.template.type as TaskTypeName;
      const items = task.template.items;
      const points = items.map((i) => ({ points: Number(attempt.answers.find((a) => a.itemId === i.id)?.autoPoints ?? 0), maxPoints: Number(i.maxPoints) }));
      const review = items.filter((i) => needsReview(type, i.content)).length;
      return {
        taskId: task.id,
        templateId: task.templateId,
        title: task.template.title,
        type,
        subject: task.template.subject.name,
        student: task.assignment.student,
        teacher: task.assignment.teacher,
        submittedAt: attempt?.submittedAt ?? task.updatedAt,
        late: attempt?.late ?? false,
        lateDays: attempt?.lateDays ?? 0,
        attemptNumber: attempt?.number ?? 1,
        suggestedGrade: suggestedGrade(points),
        reviewItems: review,
      };
    })
    .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
}

export const approvalInput = z.object({
  points: z.record(z.string().uuid(), z.coerce.number().min(0, "Un puntaje no puede ser negativo.")),
  itemComments: z.record(z.string().uuid(), z.string().trim().max(1000)).default({}),
  grade: z.coerce.number().int("La nota tiene que ser un número entero.").min(0).max(10).optional(),
  failForLate: z.boolean().default(false),
  reason: z.string().trim().max(500).optional(),
  comment: z.string().trim().max(2000).optional(),
  redo: z.boolean().default(false),
  redoDueAt: z.coerce.date().optional(),
});
export type ApprovalInput = z.input<typeof approvalInput>;

export async function approveCorrection(user: SessionUser, taskId: string, rawInput: unknown): Promise<Result<{ grade: number; passed: boolean; redo: boolean }>> {
  const submission = await loadSubmission(user, taskId);
  if (!submission) return fail("No encontramos la entrega.");
  const { task, attempt } = submission;
  if (task.status !== "COMPLETED" || !attempt?.submittedAt) return fail("Esta entrega no está esperando corrección.");
  if (attempt.result) return fail("Esta entrega ya fue corregida.");
  const parsed = approvalInput.safeParse(rawInput);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisá los datos.");
  const input = parsed.data;

  // Puntaje final por ítem: los que venían bien de un intento anterior no se tocan.
  const finals: { itemId: string; points: number; maxPoints: number; comment: string | null }[] = [];
  for (const item of task.template.items) {
    const answer = attempt.answers.find((a) => a.itemId === item.id);
    const max = Number(item.maxPoints);
    const points = answer?.carriedOver ? Number(answer.finalPoints ?? max) : round2(input.points[item.id] ?? Number(answer?.autoPoints ?? 0));
    if (points > max) return fail(`El ítem ${item.position + 1} vale como máximo ${max} puntos.`);
    finals.push({ itemId: item.id, points, maxPoints: max, comment: input.itemComments[item.id] || null });
  }

  const suggested = suggestedGrade(finals);
  const grade = input.grade ?? suggested;
  if (input.failForLate && !attempt.late) return fail("Solo se puede desaprobar por atraso una entrega fuera de término.");
  if (input.failForLate && !input.reason) return fail("Escribí el motivo de la desaprobación por atraso: lo ve el alumno.");
  const passed = isPassing(grade, task.passGrade) && !input.failForLate;
  if (input.redo && passed) return fail("Solo se puede pedir que rehaga una tarea desaprobada.");
  if (input.redo && (!input.redoDueAt || Number.isNaN(input.redoDueAt.getTime()) || input.redoDueAt.getTime() < Date.now())) return fail("Elegí una nueva fecha de entrega en el futuro para rehacerla.");

  const onBehalfOfId = user.id !== task.assignment.teacherId ? task.assignment.teacherId : null;
  await prisma.$transaction(async (tx) => {
    for (const f of finals) {
      await tx.answer.upsert({
        where: { attemptId_itemId: { attemptId: attempt.id, itemId: f.itemId } },
        create: { attemptId: attempt.id, itemId: f.itemId, finalPoints: f.points, itemComment: f.comment },
        update: { finalPoints: f.points, itemComment: f.comment },
      });
    }
    await tx.result.create({
      data: {
        attemptId: attempt.id,
        suggestedGrade: suggested,
        grade,
        gradeOverridden: grade !== suggested,
        passed,
        failedForLate: input.failForLate,
        reason: input.failForLate ? (input.reason ?? null) : null,
        comment: input.comment || null,
        redoRequested: input.redo,
        approvedById: user.id,
        onBehalfOfId,
      },
    });
    if (input.redo) {
      await tx.attempt.update({ where: { id: attempt.id }, data: { redoDueAt: input.redoDueAt } });
      await tx.task.update({ where: { id: taskId }, data: { status: "REDO", dueAt: input.redoDueAt! } });
    } else {
      await tx.task.update({ where: { id: taskId }, data: { status: "CORRECTED" } });
    }
    await tx.notification.create({ data: { userId: task.assignment.studentId, kind: input.redo ? "task.redo" : "task.corrected", payload: { taskId, title: task.template.title, grade, passed } } });
  });

  await audit({
    actorId: user.id,
    onBehalfOfId,
    action: "correction.approve",
    entity: "task",
    entityId: taskId,
    after: { attempt: attempt.number, suggested, grade, overridden: grade !== suggested, passed, failForLate: input.failForLate, redo: input.redo },
  });
  const s = task.assignment.student;
  await enqueueEmail(emails.correctionPublished({ to: s.email, name: s.firstName, title: task.template.title, redo: input.redo, url: `${env.appUrl}/alumno/tareas/${taskId}` }));
  return ok({ grade, passed, redo: input.redo });
}

// Aprobar en lote las entregas que no necesitan revisión, con la nota sugerida.
export async function bulkApprove(user: SessionUser, taskIds: string[]): Promise<{ approved: number; skipped: number }> {
  let approved = 0;
  let skipped = 0;
  for (const taskId of taskIds) {
    const submission = await loadSubmission(user, taskId);
    const type = submission?.task.template.type as TaskTypeName | undefined;
    if (!submission || !type || submission.task.template.items.some((i) => needsReview(type, i.content))) {
      skipped++;
      continue;
    }
    const points = Object.fromEntries(submission.attempt?.answers.map((a) => [a.itemId, Number(a.autoPoints ?? 0)]) ?? []);
    const result = await approveCorrection(user, taskId, { points });
    if (result.ok) approved++;
    else skipped++;
  }
  return { approved, skipped };
}
