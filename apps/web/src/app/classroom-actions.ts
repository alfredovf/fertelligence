"use server";

import { disconnectGoogle, GoogleNotConnected } from "@fertelligence/core/google/tokens";
import { listCourses, pickerToken } from "@fertelligence/core/google/classroom";
import { importDriveFile, importForm, previewRoster, runRosterImport, type RosterMapping, type RosterPreview } from "@fertelligence/core/services/classroom";
import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/session";

// Acciones de Google Classroom. Devuelven un error legible (nunca detalles técnicos de Google).

const author = () => requireActionUser("TEACHER", "ADMIN");

function message(error: unknown): string {
  if (error instanceof GoogleNotConnected) return error.message;
  if (error instanceof Error && error.message && !error.message.includes("fetch")) return error.message;
  return "No pudimos comunicarnos con Google. Probá de nuevo.";
}

export async function importFormAction(teacherId: string, subjectId: string, formId: string): Promise<{ templateId?: string; skipped?: number; error?: string }> {
  const user = await author();
  try {
    const result = await importForm(user, teacherId, subjectId, formId);
    return result.ok ? result.value : { error: result.error };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function importDriveAction(teacherId: string, subjectId: string, fileId: string): Promise<{ kind?: "text" | "photo"; id?: string; error?: string }> {
  const user = await author();
  try {
    const result = await importDriveFile(user, teacherId, subjectId, fileId);
    if (!result.ok) return { error: result.error };
    return result.value.kind === "text" ? { kind: "text", id: result.value.sourceId } : { kind: "photo", id: result.value.jobId };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function pickerTokenAction(): Promise<{ accessToken?: string; apiKey?: string; appId?: string; origin?: string; error?: string }> {
  const user = await author();
  try {
    const t = await pickerToken(user.id);
    if (!t.apiKey || !t.appId) return { error: "Falta configurar el selector de Drive (GOOGLE_PICKER_API_KEY y GOOGLE_PROJECT_NUMBER)." };
    return t;
  } catch (error) {
    return { error: message(error) };
  }
}

export async function disconnectClassroomAction(): Promise<void> {
  const user = await author();
  await disconnectGoogle(user.id);
  revalidatePath("/", "layout");
}

export async function adminCoursesAction(): Promise<{ courses?: { id: string; name: string; section?: string }[]; error?: string }> {
  await requireActionUser("ADMIN");
  const user = await requireActionUser("ADMIN");
  try {
    return { courses: (await listCourses(user.id, false)).map((c) => ({ id: c.id, name: c.name, section: c.section })) };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function rosterPreviewAction(courseIds: string[]): Promise<{ previews?: RosterPreview[]; error?: string }> {
  const user = await requireActionUser("ADMIN");
  if (courseIds.length === 0) return { error: "Elegí al menos un curso." };
  try {
    return { previews: await previewRoster(user, courseIds) };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function rosterImportAction(mappings: RosterMapping[]): Promise<{ result?: Awaited<ReturnType<typeof runRosterImport>>; error?: string }> {
  const user = await requireActionUser("ADMIN");
  if (mappings.some((m) => !m.courseId || !m.subjectId)) return { error: "Elegí el curso y la materia de Fertelligence para cada curso de Classroom." };
  try {
    const result = await runRosterImport(user, mappings);
    revalidatePath("/admin", "layout");
    return { result };
  } catch (error) {
    return { error: message(error) };
  }
}
