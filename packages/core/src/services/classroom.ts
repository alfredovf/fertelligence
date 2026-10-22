import type { Prisma } from "@prisma/client";
import { audit } from "../audit";
import type { SessionUser } from "../auth/session";
import { prisma } from "../db";
import { storeFile } from "../files";
import { courseRoster, downloadDriveFile, getForm, type RawForm, type RosterPerson } from "../google/classroom";
import { itemProblem, type EditorItem } from "../task-authoring";
import { requestTaskFromPhoto } from "./ai";
import { createPerson, setAssignment } from "./school";

// Importación desde Google Classroom: cuestionarios de Forms y archivos de Drive (docentes),
// y cursos con sus alumnos y docentes (administración).

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

async function canUseSubject(actor: SessionUser, teacherId: string, subjectId: string): Promise<string | null> {
  if (actor.role === "TEACHER" && actor.id !== teacherId) return "No tenés permiso para hacer esto.";
  const teaches = await prisma.teacherSubject.findUnique({ where: { teacherId_subjectId: { teacherId, subjectId } } });
  return teaches ? null : "Elegí una materia que dicte el docente.";
}

// ---------- Cuestionarios de Google Forms → múltiple choice ----------

export type FormMapping = { title: string; instructions: string; items: EditorItem[]; skipped: { title: string; reason: string }[] };

// Las preguntas de opción múltiple, casillas y desplegable con respuesta correcta pasan a múltiple choice.
// Las demás (respuesta corta, párrafo, escala) no tienen un tipo equivalente y se omiten, con aviso.
export function mapFormToTask(form: RawForm): FormMapping {
  const items: EditorItem[] = [];
  const skipped: FormMapping["skipped"] = [];
  let n = 0;
  for (const item of form.items ?? []) {
    const q = item.questionItem?.question;
    const title = (item.title ?? "").trim();
    if (!q) continue; // secciones, imágenes o texto sin pregunta
    const choice = q.choiceQuestion;
    if (!choice) {
      skipped.push({ title: title || "(sin título)", reason: "No es de opción múltiple" });
      continue;
    }
    const options = (choice.options ?? []).filter((o) => !o.isOther && (o.value ?? "").trim());
    const correctValues = new Set((q.grading?.correctAnswers?.answers ?? []).map((a) => a.value));
    if (correctValues.size === 0) {
      skipped.push({ title: title || "(sin título)", reason: "No tiene respuesta correcta en el cuestionario" });
      continue;
    }
    const withIds = options.map((o) => ({ id: `o${++n}`, text: o.value!.trim() }));
    const correct = withIds.filter((o) => correctValues.has(o.text)).map((o) => o.id);
    const multiple = choice.type === "CHECKBOX" && correct.length > 1;
    const editorItem: EditorItem = {
      content: { question: title, multiple, options: withIds },
      correct: { optionIds: multiple ? correct : correct.slice(0, 1) },
      maxPoints: Math.max(1, Number(q.grading?.pointValue ?? 1)),
      explanation: (q.grading?.whenRight?.text ?? q.grading?.generalFeedback?.text ?? "").trim(),
    };
    const problem = itemProblem("MULTIPLE_CHOICE", editorItem);
    if (problem) skipped.push({ title: title || "(sin título)", reason: problem });
    else items.push(editorItem);
  }
  return {
    title: (form.info?.title || form.info?.documentTitle || "Cuestionario de Classroom").slice(0, 120),
    instructions: (form.info?.description || "Leé cada pregunta y elegí la respuesta correcta.").slice(0, 2000),
    items,
    skipped,
  };
}

export async function importForm(actor: SessionUser, teacherId: string, subjectId: string, formId: string): Promise<Result<{ templateId: string; skipped: number }>> {
  const problem = await canUseSubject(actor, teacherId, subjectId);
  if (problem) return fail(problem);
  const form = await getForm(actor.id, formId);
  const mapped = mapFormToTask(form);
  if (mapped.items.length === 0) return fail(`El cuestionario no tiene preguntas de opción múltiple con respuesta correcta. ${mapped.skipped.length ? `Se omitieron ${mapped.skipped.length}.` : ""}`);
  const onBehalf = actor.id !== teacherId;
  const template = await prisma.taskTemplate.create({
    data: {
      title: mapped.title,
      instructions: mapped.instructions,
      subjectId,
      type: "MULTIPLE_CHOICE",
      origin: "CLASSROOM",
      settings: { shuffle: true, redoScope: "INCORRECT_ONLY", importWarnings: mapped.skipped.map((s) => `Se omitió "${s.title}": ${s.reason}.`) },
      createdById: actor.id,
      onBehalfOfId: onBehalf ? teacherId : null,
      items: {
        create: mapped.items.map((item, position) => ({
          position,
          content: item.content as Prisma.InputJsonValue,
          correctAnswer: item.correct as Prisma.InputJsonValue,
          maxPoints: item.maxPoints,
          explanation: item.explanation || null,
        })),
      },
    },
  });
  await prisma.classroomImport.create({ data: { kind: "MATERIAL", requestedById: actor.id, classroomCourseId: "", summary: { formId, templateId: template.id, items: mapped.items.length, skipped: mapped.skipped.length } } });
  await audit({ actorId: actor.id, onBehalfOfId: onBehalf ? teacherId : null, action: "task.import_form", entity: "task_template", entityId: template.id, after: { formId, items: mapped.items.length, skipped: mapped.skipped.length } });
  return ok({ templateId: template.id, skipped: mapped.skipped.length });
}

// ---------- Archivos de Drive ----------

// Un documento o presentación de Google se usa como texto fuente (pantalla "Desde un texto").
// Un PDF o una imagen pasa por el camino "Desde una foto".
export async function importDriveFile(actor: SessionUser, teacherId: string, subjectId: string, fileId: string): Promise<Result<{ kind: "text"; sourceId: string } | { kind: "photo"; jobId: string }>> {
  const problem = await canUseSubject(actor, teacherId, subjectId);
  if (problem) return fail(problem);
  const file = await downloadDriveFile(actor.id, fileId);
  if (file.text !== undefined) {
    if (file.text.trim().length < 80) return fail("El documento tiene muy poco texto para generar una tarea.");
    const source = await prisma.aiJob.create({
      data: { kind: "CLASSROOM_MATERIAL", requestedById: actor.id, status: "SUCCEEDED", input: { fileId, name: file.name }, output: { text: file.text, teacherId, subjectId }, costUsd: 0, finishedAt: new Date() },
    });
    return ok({ kind: "text", sourceId: source.id });
  }
  const stored = await storeFile(file.bytes!, actor.id);
  if (!stored.ok) return fail(stored.error);
  const job = await requestTaskFromPhoto(actor, { teacherId, subjectId, type: null, fileIds: [stored.id], solve: true });
  if (!job.ok) return fail(job.error);
  return ok({ kind: "photo", jobId: job.value.jobId });
}

export async function importedText(user: SessionUser, sourceId: string): Promise<{ text: string; subjectId: string } | null> {
  const job = await prisma.aiJob.findUnique({ where: { id: sourceId } });
  if (!job || job.kind !== "CLASSROOM_MATERIAL" || (user.role !== "ADMIN" && job.requestedById !== user.id)) return null;
  const out = job.output as { text?: string; subjectId?: string } | null;
  return out?.text ? { text: out.text, subjectId: out.subjectId ?? "" } : null;
}

// ---------- Cursos, alumnos y docentes (administración) ----------

export type RosterPreview = {
  classroomCourseId: string;
  teachers: (RosterPerson & { existing: boolean })[];
  students: (RosterPerson & { existing: boolean })[];
};

export async function previewRoster(admin: SessionUser, courseIds: string[]): Promise<RosterPreview[]> {
  const previews: RosterPreview[] = [];
  for (const courseId of courseIds) {
    const roster = await courseRoster(admin.id, courseId);
    const emails = [...roster.teachers, ...roster.students].map((p) => p.email).filter((e): e is string => Boolean(e));
    const existing = new Set((await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } })).map((u) => u.email));
    previews.push({
      classroomCourseId: courseId,
      teachers: roster.teachers.map((t) => ({ ...t, existing: Boolean(t.email && existing.has(t.email)) })),
      students: roster.students.map((s) => ({ ...s, existing: Boolean(s.email && existing.has(s.email)) })),
    });
  }
  return previews;
}

export type RosterMapping = { classroomCourseId: string; courseId: string; subjectId: string };

// Crea lo que falta y propone las asignaciones: cada alumno queda con el primer docente del curso en esa materia.
// A los que ya existen (mismo email) no los duplica. Nunca borra a nadie.
export async function runRosterImport(admin: SessionUser, mappings: RosterMapping[]): Promise<{ students: number; teachers: number; assignments: number; skipped: string[] }> {
  let students = 0;
  let teachers = 0;
  let assignments = 0;
  const skipped: string[] = [];
  for (const map of mappings) {
    const roster = await courseRoster(admin.id, map.classroomCourseId);
    const teacherIds: string[] = [];
    for (const t of roster.teachers) {
      if (!t.email) {
        skipped.push(`Docente ${t.firstName} ${t.lastName}: Classroom no compartió su email.`);
        continue;
      }
      let user = await prisma.user.findUnique({ where: { email: t.email } });
      if (!user) {
        const created = await createPerson("TEACHER", { firstName: t.firstName || "Docente", lastName: t.lastName || "-", email: t.email, subjectIds: [map.subjectId] }, admin.id);
        if (!created.ok) {
          skipped.push(`${t.email}: ${created.error}`);
          continue;
        }
        teachers++;
        user = await prisma.user.findUniqueOrThrow({ where: { id: created.value.id } });
      } else if (user.role === "TEACHER") {
        await prisma.teacherSubject.upsert({ where: { teacherId_subjectId: { teacherId: user.id, subjectId: map.subjectId } }, create: { teacherId: user.id, subjectId: map.subjectId }, update: {} });
      }
      if (user.role === "TEACHER") teacherIds.push(user.id);
    }
    for (const s of roster.students) {
      if (!s.email) {
        skipped.push(`Alumno ${s.firstName} ${s.lastName}: Classroom no compartió su email.`);
        continue;
      }
      let user = await prisma.user.findUnique({ where: { email: s.email } });
      if (!user) {
        const created = await createPerson("STUDENT", { firstName: s.firstName || "Alumno", lastName: s.lastName || "-", email: s.email, courseId: map.courseId }, admin.id);
        if (!created.ok) {
          skipped.push(`${s.email}: ${created.error}`);
          continue;
        }
        students++;
        user = await prisma.user.findUniqueOrThrow({ where: { id: created.value.id } });
      }
      if (user.role === "STUDENT" && teacherIds[0]) {
        const r = await setAssignment(user.id, map.subjectId, teacherIds[0], admin.id);
        if (r.ok) assignments++;
      }
    }
    await prisma.course.update({ where: { id: map.courseId }, data: { classroomCourseId: map.classroomCourseId } });
    await prisma.classroomImport.create({ data: { kind: "ROSTER", requestedById: admin.id, classroomCourseId: map.classroomCourseId, summary: { courseId: map.courseId, subjectId: map.subjectId } } });
  }
  await audit({ actorId: admin.id, action: "import.classroom_roster", entity: "courses", after: { courses: mappings.length, students, teachers, assignments, skipped: skipped.length } });
  return { students, teachers, assignments, skipped };
}
