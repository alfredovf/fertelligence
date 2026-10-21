"use server";

import { approveCorrection, bulkApprove, correctionQueue } from "@fertelligence/core/services/corrections";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { requireActionUser } from "@/lib/session";

const corrector = () => requireActionUser("TEACHER", "ADMIN");
const argDate = (value: string) => new Date(`${value}${value.length === 16 ? ":00" : ""}-03:00`);

export async function approveAction(taskId: string, basePath: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await corrector();
  const points: Record<string, string> = {};
  const itemComments: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("points:")) points[key.slice(7)] = String(value);
    if (key.startsWith("comment:") && String(value).trim()) itemComments[key.slice(8)] = String(value);
  }
  const redoDue = String(form.get("redoDueAt") ?? "");
  const result = await approveCorrection(user, taskId, {
    points,
    itemComments,
    grade: form.get("useSuggested") ? undefined : String(form.get("grade") ?? ""),
    failForLate: form.get("failForLate") === "1",
    reason: String(form.get("reason") ?? "") || undefined,
    comment: String(form.get("comment") ?? "") || undefined,
    redo: form.get("redo") === "1",
    redoDueAt: redoDue ? argDate(redoDue) : undefined,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/", "layout");
  // Sigue con la próxima entrega de la bandeja, si hay
  const next = (await correctionQueue(user.role === "TEACHER" ? user.id : null))[0];
  redirect(next ? `${basePath}/${next.taskId}?aprobada=1` : `${basePath}?aprobada=1`);
}

export async function bulkApproveAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await corrector();
  const ids = form.getAll("taskIds").map(String);
  if (ids.length === 0) return { error: "Elegí al menos una entrega." };
  const { approved, skipped } = await bulkApprove(user, ids);
  revalidatePath("/", "layout");
  return {
    success: `Aprobamos ${approved} ${approved === 1 ? "corrección" : "correcciones"} con la nota sugerida.${skipped ? ` ${skipped} necesitan revisión y quedaron en la bandeja.` : ""}`,
  };
}
