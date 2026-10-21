"use server";

import { loginWithPassword, requestPasswordReset, resetPassword } from "@fertelligence/core/services/accounts";
import { decideConsent } from "@fertelligence/core/services/consent";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { endSession, landingFor, requestMeta, startSession } from "@/lib/session";

const str = (form: FormData, key: string) => String(form.get(key) ?? "");

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await loginWithPassword(str(form, "email"), str(form, "password"));
  if (!result.ok) return { error: result.error };
  await startSession(result.user.id);
  redirect(await landingFor(result.user));
}

export async function requestResetAction(_: ActionState, form: FormData): Promise<ActionState> {
  const email = str(form, "email").trim();
  if (!email) return { error: "Escribí tu email." };
  await requestPasswordReset(email);
  return { success: "Si hay una cuenta con ese email, te enviamos un enlace para crear una contraseña nueva. Vence en 30 minutos." };
}

export async function resetPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const password = str(form, "password");
  if (password !== str(form, "confirm")) return { error: "Las dos contraseñas no coinciden." };
  const result = await resetPassword(str(form, "token"), password);
  if (!result.ok) return { error: result.error };
  await startSession(result.user.id);
  redirect(await landingFor(result.user));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/ingresar");
}

export async function consentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const granted = str(form, "decision") === "grant";
  if (granted) {
    const accepted = [0, 1, 2, 3].every((i) => form.get(`statement-${i}`) === "on");
    if (!accepted) return { error: "Para dar el consentimiento tenés que marcar las cuatro declaraciones." };
  } else if (form.get("confirmRefuse") !== "on") {
    return { error: "Para no dar el consentimiento, marcá la casilla de confirmación." };
  }
  const meta = await requestMeta();
  const result = await decideConsent(str(form, "token"), granted, { grantorName: str(form, "grantorName"), grantorRelationship: str(form, "grantorRelationship"), ...meta });
  if (!result.ok) return { error: result.error };
  redirect(`/consentimiento/listo?resultado=${granted ? "dado" : "rechazado"}`);
}
