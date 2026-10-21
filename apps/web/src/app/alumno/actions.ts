"use server";

import { prisma } from "@fertelligence/core/db";
import { saveAnswer, startOrResume, studentPreferences, submitAttempt } from "@fertelligence/core/services/attempts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { requireActionUser } from "@/lib/session";

const student = () => requireActionUser("STUDENT");

export async function startTaskAction(taskId: string): Promise<void> {
  const user = await student();
  const result = await startOrResume(user.id, taskId);
  if (!result.ok) redirect(`/alumno/tareas/${taskId}`);
  redirect(`/alumno/tareas/${taskId}/resolver`);
}

// Guardado automático de una respuesta. Devuelve un error legible si no se pudo.
export async function saveAnswerAction(taskId: string, itemId: string, responseJson: string): Promise<{ ok: boolean; error?: string }> {
  const user = await student();
  let response: unknown;
  try {
    response = JSON.parse(responseJson);
  } catch {
    return { ok: false, error: "No se pudo leer la respuesta." };
  }
  const result = await saveAnswer(user.id, taskId, itemId, response);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function submitTaskAction(taskId: string): Promise<{ error?: string }> {
  const user = await student();
  const result = await submitAttempt(user.id, taskId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/alumno", "layout");
  redirect(`/alumno/tareas/${taskId}/entregada${result.value.late ? "?tarde=1" : ""}`);
}

export async function savePreferencesAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await student();
  const parsed = studentPreferences.safeParse({
    fontSize: String(form.get("fontSize") ?? "normal"),
    autoRead: form.get("autoRead") === "on",
    pauseReminders: form.get("pauseReminders") === "on",
    showTimer: form.get("showTimer") === "on",
    showAchievements: form.get("showAchievements") === "on",
    reduceMotion: form.get("reduceMotion") === "on",
  });
  if (!parsed.success) return { error: "Revisá las opciones." };
  await prisma.studentProfile.update({ where: { userId: user.id }, data: { preferences: parsed.data } });
  revalidatePath("/", "layout");
  return { success: "Guardamos tus preferencias. Se aplican en todas tus tareas." };
}
