import { Prisma, type TaskStatus, type TaskType } from "@prisma/client";
import { z } from "zod";
import { audit } from "../audit";
import type { SessionUser } from "../auth/session";
import { prisma } from "../db";
import { editorItem, itemProblem, MAX_ITEMS } from "../task-authoring";

// Armado y publicación de tareas.
// Una plantilla (task_templates) es la tarea que arma el docente; al publicarla se crea una tarea (tasks)
// por alumno. Quién la "posee": el docente; si la cargó un administrador, on_behalf_of_id = docente.

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

export const REDO_SCOPES = ["INCORRECT_ONLY", "ALL"] as const;
export type RedoScope = (typeof REDO_SCOPES)[number];

export const templateSettings = z.object({
  shuffle: z.boolean().default(true),
  redoScope: z.enum(REDO_SCOPES).default("INCORRECT_ONLY"),
});
export type TemplateSettings = z.infer<typeof templateSettings>;

export function readSettings(value: unknown): TemplateSettings {
  return templateSettings.parse(value ?? {});
}

// Plantillas de un docente: las que creó o las que un administrador cargó en su nombre.
export function ownedBy(teacherId: string): Prisma.TaskTemplateWhereInput {
  return { OR: [{ createdById: teacherId, onBehalfOfId: null }, { onBehalfOfId: teacherId }] };
}

export function ownerOf(template: { createdById: string; onBehalfOfId: string | null }): string {
  return template.onBehalfOfId ?? template.createdById;
}

// El docente dueño puede todo; un administrador también (actúa en nombre del dueño).
export async function loadTemplateFor(user: SessionUser, templateId: string) {
  const template = await prisma.taskTemplate.findUnique({ where: { id: templateId }, include: { items: { orderBy: { position: "asc" } }, subject: true } });
  if (!template) return null;
  if (user.role === "ADMIN" || (user.role === "TEACHER" && ownerOf(template) === user.id)) return template;
  return null;
}

// Una tarea con intentos de alumnos ya no se edita: se duplica (así no cambia la clave de corrección).
export async function isEditable(templateId: string): Promise<boolean> {
  return (await prisma.attempt.count({ where: { task: { templateId } } })) === 0;
}

const metaInput = z.object({
  title: z.string().trim().min(1, "Escribí un título.").max(120, "El título es demasiado largo."),
  instructions: z.string().trim().min(1, "Escribí la consigna general.").max(2000, "La consigna es demasiado larga."),
  subjectId: z.string().uuid("Elegí la materia."),
  type: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "MATCHING", "FILL_BLANKS", "STRIKE_OUT"], { errorMap: () => ({ message: "Elegí el tipo de tarea." }) }),
  settings: templateSettings,
});

export async function createTemplate(actor: SessionUser, teacherId: string, input: unknown): Promise<Result<{ id: string }>> {
  const parsed = metaInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisá los datos.");
  const teaches = await prisma.teacherSubject.findUnique({ where: { teacherId_subjectId: { teacherId, subjectId: parsed.data.subjectId } } });
  if (!teaches) return fail("Esa materia no está entre las que dicta el docente.");
  const onBehalf = actor.id !== teacherId;
  const template = await prisma.taskTemplate.create({
    data: { ...parsed.data, settings: parsed.data.settings, createdById: actor.id, onBehalfOfId: onBehalf ? teacherId : null, origin: "FORM" },
  });
  await audit({ actorId: actor.id, onBehalfOfId: onBehalf ? teacherId : null, action: "task.create", entity: "task_template", entityId: template.id, after: parsed.data });
  if (onBehalf) {
    await prisma.notification.create({ data: { userId: teacherId, kind: "task.created_on_behalf", payload: { templateId: template.id, title: template.title, by: `${actor.firstName} ${actor.lastName}` } } });
  }
  return ok({ id: template.id });
}

export async function updateTemplateMeta(actor: SessionUser, templateId: string, input: unknown): Promise<Result> {
  const template = await loadTemplateFor(actor, templateId);
  if (!template) return fail("No encontramos la tarea.");
  const parsed = metaInput.omit({ type: true }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisá los datos.");
  const published = (await prisma.task.count({ where: { templateId } })) > 0;
  if (published && parsed.data.subjectId !== template.subjectId) return fail("No se puede cambiar la materia de una tarea ya asignada.");
  const teaches = await prisma.teacherSubject.findUnique({ where: { teacherId_subjectId: { teacherId: ownerOf(template), subjectId: parsed.data.subjectId } } });
  if (!teaches) return fail("Esa materia no está entre las que dicta el docente.");
  await prisma.taskTemplate.update({ where: { id: templateId }, data: { ...parsed.data, settings: parsed.data.settings } });
  await audit({ actorId: actor.id, onBehalfOfId: actor.id !== ownerOf(template) ? ownerOf(template) : null, action: "task.update", entity: "task_template", entityId: templateId, after: parsed.data });
  return ok(undefined);
}

// Reemplaza todos los ítems. Valida cada uno según el tipo de la tarea.
export async function saveItems(actor: SessionUser, templateId: string, rawItems: unknown): Promise<Result> {
  const template = await loadTemplateFor(actor, templateId);
  if (!template) return fail("No encontramos la tarea.");
  if (!(await isEditable(templateId))) return fail("Algún alumno ya empezó esta tarea, así que no se puede editar. Duplicala para hacer cambios.");
  const parsed = z.array(editorItem).min(1, "Agregá al menos un ítem.").max(MAX_ITEMS, `Una tarea puede tener hasta ${MAX_ITEMS} ítems.`).safeParse(rawItems);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisá los ítems.");
  for (const [index, item] of parsed.data.entries()) {
    const problem = itemProblem(template.type, item);
    if (problem) return fail(`Ítem ${index + 1}: ${problem}`);
  }
  await prisma.$transaction([
    prisma.templateItem.deleteMany({ where: { templateId } }),
    prisma.templateItem.createMany({
      data: parsed.data.map((item, position) => ({
        templateId,
        position,
        content: item.content as Prisma.InputJsonValue,
        correctAnswer: item.correct as Prisma.InputJsonValue,
        maxPoints: item.maxPoints,
        explanation: item.explanation?.trim() || null,
        imageFileId: item.imageFileId ?? null,
      })),
    }),
  ]);
  await audit({ actorId: actor.id, onBehalfOfId: actor.id !== ownerOf(template) ? ownerOf(template) : null, action: "task.items_saved", entity: "task_template", entityId: templateId, after: { items: parsed.data.length } });
  return ok(undefined);
}

// Alumnos a los que el dueño puede asignar esta tarea: los de sus asignaciones activas en esa materia.
export async function assignableStudents(templateId: string) {
  const template = await prisma.taskTemplate.findUniqueOrThrow({ where: { id: templateId } });
  const assignments = await prisma.assignment.findMany({
    where: { teacherId: ownerOf(template), subjectId: template.subjectId, active: true, student: { status: { not: "DISABLED" } } },
    include: { student: { include: { studentProfile: { include: { course: true } } } }, tasks: { where: { templateId }, select: { id: true, status: true } } },
    orderBy: [{ student: { lastName: "asc" } }],
  });
  return assignments.map((a) => ({
    assignmentId: a.id,
    studentId: a.studentId,
    name: `${a.student.lastName}, ${a.student.firstName}`,
    course: a.student.studentProfile?.course.name ?? "",
    pending: a.student.status === "PENDING_CONSENT",
    taskStatus: a.tasks[0]?.status ?? null,
  }));
}

const publishInput = z
  .object({
    assignmentIds: z.array(z.string().uuid()).min(1, "Elegí al menos un alumno."),
    startsAt: z.coerce.date({ errorMap: () => ({ message: "La fecha de inicio no es válida." }) }),
    dueAt: z.coerce.date({ errorMap: () => ({ message: "La fecha de entrega no es válida." }) }),
    passGrade: z.coerce.number().int().min(1).max(10),
  })
  .refine((d) => d.dueAt > d.startsAt, { message: "La entrega tiene que ser después del inicio." });

// Publica la tarea para los alumnos elegidos. A los que ya la tienen no se les vuelve a crear.
export async function publishTemplate(actor: SessionUser, templateId: string, input: unknown): Promise<Result<{ created: number }>> {
  const template = await loadTemplateFor(actor, templateId);
  if (!template) return fail("No encontramos la tarea.");
  if (template.items.length === 0) return fail("Agregá al menos un ítem antes de asignarla.");
  const parsed = publishInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisá los datos.");
  const { assignmentIds, startsAt, dueAt, passGrade } = parsed.data;
  if (dueAt.getTime() < Date.now()) return fail("La fecha de entrega ya pasó.");

  const valid = await prisma.assignment.findMany({
    where: { id: { in: assignmentIds }, teacherId: ownerOf(template), subjectId: template.subjectId, active: true },
    include: { tasks: { where: { templateId }, select: { id: true } } },
  });
  if (valid.length !== assignmentIds.length) return fail("Alguno de los alumnos elegidos no está asignado a este docente en esta materia.");
  const toCreate = valid.filter((a) => a.tasks.length === 0);
  const now = new Date();
  const status: TaskStatus = startsAt <= now ? "NEW" : "SCHEDULED";
  await prisma.task.createMany({
    data: toCreate.map((a) => ({ templateId, assignmentId: a.id, status, startsAt, dueAt, passGrade, publishedAt: now })),
  });
  await audit({
    actorId: actor.id,
    onBehalfOfId: actor.id !== ownerOf(template) ? ownerOf(template) : null,
    action: "task.publish",
    entity: "task_template",
    entityId: templateId,
    after: { students: toCreate.length, startsAt, dueAt, passGrade },
  });
  return ok({ created: toCreate.length });
}

export async function duplicateTemplate(actor: SessionUser, templateId: string): Promise<Result<{ id: string }>> {
  const template = await loadTemplateFor(actor, templateId);
  if (!template) return fail("No encontramos la tarea.");
  const owner = ownerOf(template);
  const copy = await prisma.taskTemplate.create({
    data: {
      title: `Copia de ${template.title}`.slice(0, 120),
      instructions: template.instructions,
      subjectId: template.subjectId,
      type: template.type,
      settings: template.settings as Prisma.InputJsonValue,
      origin: template.origin,
      createdById: actor.id,
      onBehalfOfId: actor.id !== owner ? owner : null,
      items: {
        create: template.items.map((i) => ({
          position: i.position,
          content: i.content as Prisma.InputJsonValue,
          correctAnswer: i.correctAnswer as Prisma.InputJsonValue,
          maxPoints: i.maxPoints,
          explanation: i.explanation,
          imageFileId: i.imageFileId,
        })),
      },
    },
  });
  await audit({ actorId: actor.id, onBehalfOfId: actor.id !== owner ? owner : null, action: "task.duplicate", entity: "task_template", entityId: copy.id, before: { from: templateId } });
  return ok({ id: copy.id });
}

export async function setInBank(actor: SessionUser, templateId: string, inBank: boolean): Promise<Result> {
  const template = await loadTemplateFor(actor, templateId);
  if (!template) return fail("No encontramos la tarea.");
  await prisma.taskTemplate.update({ where: { id: templateId }, data: { inBank } });
  await audit({ actorId: actor.id, action: inBank ? "task.bank_add" : "task.bank_remove", entity: "task_template", entityId: templateId });
  return ok(undefined);
}

export async function deleteDraft(actor: SessionUser, templateId: string): Promise<Result> {
  const template = await loadTemplateFor(actor, templateId);
  if (!template) return fail("No encontramos la tarea.");
  if ((await prisma.task.count({ where: { templateId } })) > 0) return fail("La tarea ya está asignada: no se puede borrar.");
  await prisma.taskTemplate.delete({ where: { id: templateId } });
  await audit({ actorId: actor.id, action: "task.delete_draft", entity: "task_template", entityId: templateId, before: { title: template.title } });
  return ok(undefined);
}

export async function extendDueDate(actor: SessionUser, templateId: string, dueAt: Date): Promise<Result<{ updated: number }>> {
  const template = await loadTemplateFor(actor, templateId);
  if (!template) return fail("No encontramos la tarea.");
  if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() < Date.now()) return fail("La nueva fecha tiene que ser en el futuro.");
  const tasks = await prisma.task.findMany({ where: { templateId, status: { in: ["SCHEDULED", "NEW", "IN_PROGRESS", "OVERDUE"] } } });
  for (const task of tasks) {
    if (dueAt <= task.startsAt) return fail("La nueva fecha tiene que ser después del inicio.");
  }
  const { count } = await prisma.task.updateMany({ where: { id: { in: tasks.map((t) => t.id) } }, data: { dueAt } });
  // Las vencidas vuelven a quedar disponibles
  await prisma.task.updateMany({ where: { id: { in: tasks.map((t) => t.id) }, status: "OVERDUE" }, data: { status: "NEW" } });
  await audit({ actorId: actor.id, action: "task.extend_due", entity: "task_template", entityId: templateId, after: { dueAt, tasks: count } });
  return ok({ updated: count });
}

// Cambios de estado por fecha. Lo corre el worker cada pocos minutos.
export async function tickTaskStatuses(now = new Date()): Promise<{ opened: number; overdue: number }> {
  const opened = await prisma.task.updateMany({ where: { status: "SCHEDULED", startsAt: { lte: now } }, data: { status: "NEW" } });
  const overdue = await prisma.task.updateMany({ where: { status: { in: ["NEW", "IN_PROGRESS", "REDO"] }, dueAt: { lt: now } }, data: { status: "OVERDUE" } });
  return { opened: opened.count, overdue: overdue.count };
}

export const taskStatusLabels: Record<TaskStatus, string> = {
  DRAFT: "Borrador",
  SCHEDULED: "Programada",
  NEW: "Nueva",
  IN_PROGRESS: "En progreso",
  OVERDUE: "Vencida",
  COMPLETED: "Completada",
  CORRECTED: "Corregida",
  REDO: "Para rehacer",
};

export type { TaskType };
