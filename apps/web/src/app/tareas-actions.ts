"use server";

import { prisma } from "@fertelligence/core/db";
import { storeFile } from "@fertelligence/core/files";
import { requestTaskFromPhoto, requestTaskFromText, transcribePhotos } from "@fertelligence/core/services/ai";
import { createTemplate, deleteDraft, duplicateTemplate, extendDueDate, publishTemplate, saveItems, setInBank, updateTemplateMeta } from "@fertelligence/core/services/tasks";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { requireActionUser } from "@/lib/session";

// Acciones de armado de tareas. Las usan el docente (/docente/tareas) y el administrador
// cuando carga en nombre de un docente (/admin/tareas). basePath indica adónde volver.

const author = () => requireActionUser("TEACHER", "ADMIN");
const str = (form: FormData, key: string) => String(form.get(key) ?? "");
// Las fechas del formulario están en hora de Argentina (UTC-3, sin horario de verano).
const argDate = (value: string) => new Date(`${value}${value.length === 16 ? ":00" : ""}-03:00`);

function metaFrom(form: FormData) {
  return {
    title: str(form, "title"),
    instructions: str(form, "instructions"),
    subjectId: str(form, "subjectId"),
    type: str(form, "type"),
    settings: { shuffle: form.get("shuffle") === "on", redoScope: str(form, "redoScope") || "INCORRECT_ONLY" },
  };
}

export async function createTaskAction(teacherId: string, basePath: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await author();
  if (user.role === "TEACHER" && teacherId !== user.id) return { error: "No tenés permiso para hacer esto." };
  if (user.role === "ADMIN") {
    const teacher = await prisma.user.findFirst({ where: { id: teacherId, role: "TEACHER", status: "ACTIVE" } });
    if (!teacher) return { error: "Elegí un docente activo." };
  }
  const result = await createTemplate(user, teacherId, metaFrom(form));
  if (!result.ok) return { error: result.error };
  redirect(`${basePath}/${result.value.id}/items`);
}

export async function updateMetaAction(templateId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await author();
  const result = await updateTemplateMeta(user, templateId, metaFrom(form));
  if (!result.ok) return { error: result.error };
  revalidatePath("/", "layout");
  return { success: "Guardamos los datos de la tarea." };
}

export async function saveItemsAction(templateId: string, itemsJson: string): Promise<{ error?: string; success?: string }> {
  const user = await author();
  let items: unknown;
  try {
    items = JSON.parse(itemsJson);
  } catch {
    return { error: "No se pudieron leer los ítems." };
  }
  const result = await saveItems(user, templateId, items);
  if (!result.ok) return { error: result.error };
  revalidatePath("/", "layout");
  return { success: "Guardamos los ítems." };
}

export async function uploadImageAction(form: FormData): Promise<{ id?: string; error?: string }> {
  const user = await author();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Elegí una imagen." };
  const stored = await storeFile(Buffer.from(await file.arrayBuffer()), user.id);
  if (!stored.ok) return { error: stored.error };
  const record = await prisma.file.findUniqueOrThrow({ where: { id: stored.id } });
  if (!record.mimeType.startsWith("image/")) return { error: "Para los ítems solo se aceptan imágenes." };
  return { id: stored.id };
}

export async function publishAction(templateId: string, basePath: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await author();
  const result = await publishTemplate(user, templateId, {
    assignmentIds: form.getAll("assignmentIds").map(String),
    startsAt: argDate(str(form, "startsAt")),
    dueAt: argDate(str(form, "dueAt")),
    passGrade: str(form, "passGrade"),
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/", "layout");
  redirect(`${basePath}/${templateId}?asignada=${result.value.created}`);
}

export async function duplicateAction(templateId: string, basePath: string): Promise<void> {
  const user = await author();
  const result = await duplicateTemplate(user, templateId);
  if (!result.ok) throw new Error(result.error);
  redirect(`${basePath}/${result.value.id}/items`);
}

export async function bankAction(templateId: string, inBank: boolean): Promise<void> {
  const user = await author();
  await setInBank(user, templateId, inBank);
  revalidatePath("/", "layout");
}

export async function deleteDraftAction(templateId: string, basePath: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await author();
  if (form.get("confirm") !== "on") return { error: "Marcá la casilla para confirmar." };
  const result = await deleteDraft(user, templateId);
  if (!result.ok) return { error: result.error };
  redirect(basePath);
}

export async function extendDueAction(templateId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await author();
  const result = await extendDueDate(user, templateId, argDate(str(form, "dueAt")));
  if (!result.ok) return { error: result.error };
  revalidatePath("/", "layout");
  return { success: `Extendimos el plazo de ${result.value.updated} ${result.value.updated === 1 ? "tarea" : "tareas"}.` };
}

// ---------- Creación con IA ----------

export async function photoTaskAction(teacherId: string, basePath: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await author();
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Subí al menos una foto o un PDF del ejercicio." };
  if (files.length > 3) return { error: "Podés subir hasta 3 archivos." };
  const fileIds: string[] = [];
  for (const file of files) {
    const stored = await storeFile(Buffer.from(await file.arrayBuffer()), user.id);
    if (!stored.ok) return { error: `${file.name}: ${stored.error}` };
    fileIds.push(stored.id);
  }
  const type = str(form, "type");
  const result = await requestTaskFromPhoto(user, { teacherId, subjectId: str(form, "subjectId"), type: type === "AUTO" ? null : type, fileIds, solve: form.get("solve") === "on" });
  if (!result.ok) return { error: result.error };
  redirect(`${basePath}/ia/${result.value.jobId}`);
}

export async function textTaskAction(teacherId: string, basePath: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await author();
  const result = await requestTaskFromText(user, {
    teacherId,
    subjectId: str(form, "subjectId"),
    type: str(form, "type"),
    text: str(form, "text"),
    questions: str(form, "questions"),
    elements: str(form, "elements") || "4",
    correctPerItem: str(form, "correctPerItem") || "1",
    distractors: str(form, "distractors") || "0",
    simpleLanguage: form.get("simpleLanguage") === "on",
    justification: form.get("justification") === "on",
    level: str(form, "level"),
  });
  if (!result.ok) return { error: result.error };
  redirect(`${basePath}/ia/${result.value.jobId}`);
}

export async function transcribeAction(form: FormData): Promise<{ text?: string; error?: string }> {
  const user = await author();
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0 || files.length > 3) return { error: "Elegí entre 1 y 3 fotos." };
  const fileIds: string[] = [];
  for (const file of files) {
    const stored = await storeFile(Buffer.from(await file.arrayBuffer()), user.id);
    if (!stored.ok) return { error: stored.error };
    fileIds.push(stored.id);
  }
  const result = await transcribePhotos(user, fileIds);
  return result.ok ? { text: result.value.text } : { error: result.error };
}
