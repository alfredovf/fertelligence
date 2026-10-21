"use server";

import { audit } from "@fertelligence/core/audit";
import { invalidateUserSessions } from "@fertelligence/core/auth/session";
import { prisma } from "@fertelligence/core/db";
import { requestPasswordReset } from "@fertelligence/core/services/accounts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { endSession, requireActionUser } from "@/lib/session";

const THEMES = ["SYSTEM", "LIGHT", "DARK"] as const;

export async function saveThemeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireActionUser();
  const theme = String(form.get("theme"));
  if (!THEMES.includes(theme as (typeof THEMES)[number])) return { error: "Elegí un tema." };
  await prisma.user.update({ where: { id: user.id }, data: { theme: theme as (typeof THEMES)[number] } });
  revalidatePath("/", "layout");
  return { success: "Guardamos tu tema. Se aplica en todos tus dispositivos." };
}

export async function sendPasswordLinkAction(): Promise<ActionState> {
  const user = await requireActionUser();
  await requestPasswordReset(user.email);
  return { success: `Te enviamos un enlace a ${user.email} para crear una contraseña nueva.` };
}

export async function logoutEverywhereAction(): Promise<void> {
  const user = await requireActionUser();
  await invalidateUserSessions(user.id);
  await audit({ actorId: user.id, action: "auth.logout_all", entity: "user", entityId: user.id });
  await endSession();
  redirect("/ingresar");
}
