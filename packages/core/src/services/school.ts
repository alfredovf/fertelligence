import { Prisma, type Role } from "@prisma/client";
import { z } from "zod";
import { audit } from "../audit";
import { invalidateUserSessions } from "../auth/session";
import { prisma } from "../db";
import { normalizeEmail, sendInvitation } from "./accounts";
import { requestConsent } from "./consent";

// Administración de la escuela: materias, cursos, personas y asignaciones.
// Cada operación valida con zod, registra auditoría y devuelve un error legible.

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

const text = (label: string, max = 120) => z.string({ required_error: `Completá ${label}.` }).trim().min(1, `Completá ${label}.`).max(max, `${label} es demasiado largo.`);
const optionalText = (max = 200) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const email = z.string().trim().toLowerCase().email("El email no es válido.");
const optionalEmail = z.union([z.literal(""), email]).optional().transform((v) => (v ? v : null));

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisá los datos.";
}

function uniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function activeCycleId(): Promise<string> {
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 1 } });
  if (!settings?.activeCycleId) throw new Error("No hay un ciclo lectivo activo.");
  return settings.activeCycleId;
}

// ---------- Materias ----------

export const subjectInput = z.object({
  name: text("el nombre", 80),
  area: optionalText(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  description: optionalText(500),
});

export async function saveSubject(id: string | null, input: unknown, actorId: string): Promise<Result<{ id: string }>> {
  const parsed = subjectInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  try {
    if (id) {
      const before = await prisma.subject.findUniqueOrThrow({ where: { id } });
      const subject = await prisma.subject.update({ where: { id }, data: parsed.data });
      await audit({ actorId, action: "subject.update", entity: "subject", entityId: id, before, after: subject });
      return ok({ id });
    }
    const subject = await prisma.subject.create({ data: parsed.data });
    await audit({ actorId, action: "subject.create", entity: "subject", entityId: subject.id, after: subject });
    return ok({ id: subject.id });
  } catch (error) {
    if (uniqueViolation(error)) return fail("Ya existe una materia con ese nombre.");
    throw error;
  }
}

export async function setSubjectArchived(id: string, archived: boolean, actorId: string): Promise<Result> {
  await prisma.subject.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  await audit({ actorId, action: archived ? "subject.archive" : "subject.unarchive", entity: "subject", entityId: id });
  return ok(undefined);
}

// ---------- Cursos ----------

export const courseInput = z.object({ name: text("el nombre del curso", 40) });

export async function saveCourse(id: string | null, input: unknown, actorId: string): Promise<Result<{ id: string }>> {
  const parsed = courseInput.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  try {
    if (id) {
      await prisma.course.update({ where: { id }, data: parsed.data });
      await audit({ actorId, action: "course.update", entity: "course", entityId: id, after: parsed.data });
      return ok({ id });
    }
    const course = await prisma.course.create({ data: { ...parsed.data, cycleId: await activeCycleId() } });
    await audit({ actorId, action: "course.create", entity: "course", entityId: course.id, after: course });
    return ok({ id: course.id });
  } catch (error) {
    if (uniqueViolation(error)) return fail("Ya existe un curso con ese nombre en este ciclo.");
    throw error;
  }
}

// ---------- Personas ----------

const personBase = { firstName: text("el nombre", 60), lastName: text("el apellido", 60), email };

export const teacherInput = z.object({ ...personBase, subjectIds: z.array(z.string().uuid()).default([]) });
export const adminInput = z.object(personBase);
export const studentInput = z.object({
  ...personBase,
  courseId: z.string({ required_error: "Elegí un curso." }).uuid("Elegí un curso."),
  familyContactName: optionalText(120),
  familyContactEmail: optionalEmail,
  familyContactPhone: optionalText(40),
});

export type PersonInput = { role: Role } & Record<string, unknown>;

// Alta: docentes y administradores reciben una invitación; los alumnos quedan pendientes de consentimiento
// y se le envía el pedido a la familia (si tiene email cargado).
export async function createPerson(role: Role, input: unknown, actorId: string, options: { notify?: boolean } = {}): Promise<Result<{ id: string }>> {
  const notify = options.notify ?? true;
  try {
    if (role === "STUDENT") {
      const parsed = studentInput.safeParse(input);
      if (!parsed.success) return fail(firstIssue(parsed.error));
      const { courseId, familyContactName, familyContactEmail, familyContactPhone, ...person } = parsed.data;
      const user = await prisma.user.create({
        data: { ...person, role, status: "PENDING_CONSENT", studentProfile: { create: { courseId, familyContactName, familyContactEmail, familyContactPhone } } },
      });
      await audit({ actorId, action: "user.create", entity: "user", entityId: user.id, after: { ...parsed.data, role } });
      if (notify && familyContactEmail) await requestConsent(user.id, { actorId });
      return ok({ id: user.id });
    }
    if (role === "TEACHER") {
      const parsed = teacherInput.safeParse(input);
      if (!parsed.success) return fail(firstIssue(parsed.error));
      const { subjectIds, ...person } = parsed.data;
      const user = await prisma.user.create({ data: { ...person, role, teacherSubjects: { create: subjectIds.map((subjectId) => ({ subjectId })) } } });
      await audit({ actorId, action: "user.create", entity: "user", entityId: user.id, after: { ...parsed.data, role } });
      if (notify) await sendInvitation(user.id, actorId);
      return ok({ id: user.id });
    }
    const parsed = adminInput.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const user = await prisma.user.create({ data: { ...parsed.data, role } });
    await audit({ actorId, action: "user.create", entity: "user", entityId: user.id, after: { ...parsed.data, role } });
    if (notify) await sendInvitation(user.id, actorId);
    return ok({ id: user.id });
  } catch (error) {
    if (uniqueViolation(error)) return fail("Ya existe una persona con ese email.");
    throw error;
  }
}

export async function updatePerson(id: string, input: unknown, actorId: string): Promise<Result> {
  const before = await prisma.user.findUniqueOrThrow({ where: { id }, include: { studentProfile: true, teacherSubjects: true } });
  try {
    if (before.role === "STUDENT") {
      const parsed = studentInput.safeParse(input);
      if (!parsed.success) return fail(firstIssue(parsed.error));
      const { courseId, familyContactName, familyContactEmail, familyContactPhone, ...person } = parsed.data;
      await prisma.user.update({
        where: { id },
        data: { ...person, studentProfile: { upsert: { create: { courseId, familyContactName, familyContactEmail, familyContactPhone }, update: { courseId, familyContactName, familyContactEmail, familyContactPhone } } } },
      });
      await audit({ actorId, action: "user.update", entity: "user", entityId: id, before, after: parsed.data });
      return ok(undefined);
    }
    if (before.role === "TEACHER") {
      const parsed = teacherInput.safeParse(input);
      if (!parsed.success) return fail(firstIssue(parsed.error));
      const { subjectIds, ...person } = parsed.data;
      // No se puede quitar una materia que el docente tiene en asignaciones activas
      const removed = before.teacherSubjects.map((t) => t.subjectId).filter((s) => !subjectIds.includes(s));
      if (removed.length) {
        const inUse = await prisma.assignment.count({ where: { teacherId: id, active: true, subjectId: { in: removed } } });
        if (inUse) return fail("No se puede quitar una materia que el docente tiene asignada a alumnos. Primero cambiá esas asignaciones.");
      }
      await prisma.$transaction([
        prisma.user.update({ where: { id }, data: person }),
        prisma.teacherSubject.deleteMany({ where: { teacherId: id, subjectId: { in: removed } } }),
        prisma.teacherSubject.createMany({ data: subjectIds.map((subjectId) => ({ teacherId: id, subjectId })), skipDuplicates: true }),
      ]);
      await audit({ actorId, action: "user.update", entity: "user", entityId: id, before, after: parsed.data });
      return ok(undefined);
    }
    const parsed = adminInput.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    await prisma.user.update({ where: { id }, data: parsed.data });
    await audit({ actorId, action: "user.update", entity: "user", entityId: id, before, after: parsed.data });
    return ok(undefined);
  } catch (error) {
    if (uniqueViolation(error)) return fail("Ya existe una persona con ese email.");
    throw error;
  }
}

export async function setPersonActive(id: string, active: boolean, actorId: string): Promise<Result> {
  if (id === actorId && !active) return fail("No podés desactivar tu propia cuenta.");
  const user = await prisma.user.findUniqueOrThrow({ where: { id }, include: { consents: { where: { status: "GRANTED", revokedAt: null } } } });
  // Un alumno reactivado sin consentimiento vigente vuelve a quedar pendiente
  const status = !active ? "DISABLED" : user.role === "STUDENT" && user.consents.length === 0 ? "PENDING_CONSENT" : "ACTIVE";
  await prisma.user.update({ where: { id }, data: { status } });
  if (!active) await invalidateUserSessions(id);
  await audit({ actorId, action: active ? "user.activate" : "user.deactivate", entity: "user", entityId: id });
  return ok(undefined);
}

// ---------- Asignaciones ----------

// Asigna (o cambia, o quita con teacherId = null) el docente de un alumno en una materia, en el ciclo activo.
export async function setAssignment(studentId: string, subjectId: string, teacherId: string | null, actorId: string): Promise<Result> {
  const cycleId = await activeCycleId();
  if (teacherId) {
    const teaches = await prisma.teacherSubject.findUnique({ where: { teacherId_subjectId: { teacherId, subjectId } } });
    if (!teaches) return fail("Ese docente no dicta esa materia. Agregásela en su ficha primero.");
  }
  const current = await prisma.assignment.findFirst({ where: { studentId, subjectId, cycleId, active: true } });
  if (current?.teacherId === teacherId) return ok(undefined);
  await prisma.$transaction(async (tx) => {
    if (current) await tx.assignment.update({ where: { id: current.id }, data: { active: false } });
    const created = teacherId ? await tx.assignment.create({ data: { studentId, subjectId, teacherId, cycleId } }) : null;
    await audit({ actorId, action: "assignment.set", entity: "assignment", entityId: created?.id ?? current?.id, before: current ? { teacherId: current.teacherId } : null, after: { studentId, subjectId, teacherId } }, tx);
  });
  return ok(undefined);
}

export function displayName(user: { firstName: string; lastName: string }) {
  return `${user.firstName} ${user.lastName}`;
}

export { normalizeEmail };
