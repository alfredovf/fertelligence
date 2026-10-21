import type { User } from "@prisma/client";
import { audit } from "../audit";
import { consumeVerificationToken, createVerificationToken, DAY, peekVerificationToken } from "../auth/verification";
import { hashPassword, passwordProblem, verifyPassword } from "../auth/password";
import { invalidateUserSessions } from "../auth/session";
import { prisma } from "../db";
import { emails } from "../email/templates";
import { env } from "../env";
import { enqueueEmail } from "../queue";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export type LoginResult = { ok: true; user: User } | { ok: false; error: string };

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

function statusProblem(user: User): string | null {
  if (user.deletedAt || user.status === "DISABLED") return "Tu cuenta está desactivada. Consultá con la escuela.";
  if (user.status === "PENDING_CONSENT") return "Todavía falta el consentimiento de tu familia. La escuela le envió un email para darlo.";
  return null;
}

async function recentFailures(email: string): Promise<number> {
  return prisma.auditLog.count({
    where: { action: "auth.login_failed", entity: "login", entityId: email, createdAt: { gte: new Date(Date.now() - LOCK_MINUTES * 60_000) } },
  });
}

// Ingreso con email y contraseña. 5 intentos fallidos en 15 minutos bloquean ese email por 15 minutos.
export async function loginWithPassword(rawEmail: string, password: string): Promise<LoginResult> {
  const email = normalizeEmail(rawEmail);
  if ((await recentFailures(email)) >= MAX_FAILURES) {
    return { ok: false, error: `Hubo demasiados intentos fallidos. Probá de nuevo en ${LOCK_MINUTES} minutos o creá una contraseña nueva.` };
  }
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user?.passwordHash ? await verifyPassword(user.passwordHash, password) : false;
  if (!user || !valid) {
    await audit({ action: "auth.login_failed", entity: "login", entityId: email });
    return { ok: false, error: "El email o la contraseña no son correctos." };
  }
  const problem = statusProblem(user);
  if (problem) return { ok: false, error: problem };
  await audit({ actorId: user.id, action: "auth.login", entity: "user", entityId: user.id, after: { method: "password" } });
  return { ok: true, user };
}

// Ingreso con Google: solo entra quien ya fue dado de alta con ese email.
export async function loginWithGoogle(googleSub: string, rawEmail: string, emailVerified: boolean): Promise<LoginResult> {
  const email = normalizeEmail(rawEmail);
  const bySub = await prisma.user.findUnique({ where: { googleSub } });
  let user = bySub;
  if (!user) {
    if (!emailVerified) return { ok: false, error: "Tu cuenta de Google no tiene el email verificado." };
    user = await prisma.user.findUnique({ where: { email } });
    if (!user) return { ok: false, error: `No hay una cuenta de Fertelligence para ${email}. Pedile a la escuela que te dé de alta con ese email.` };
    if (user.googleSub && user.googleSub !== googleSub) return { ok: false, error: "Este email ya está vinculado a otra cuenta de Google." };
    if (!env.integrations.google) return { ok: false, error: "El ingreso con Google no está configurado." };
  }
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 1 } });
  if (settings && !settings.googleLoginEnabled) return { ok: false, error: "La escuela desactivó el ingreso con Google." };
  const problem = statusProblem(user);
  if (problem) return { ok: false, error: problem };
  if (!user.googleSub) user = await prisma.user.update({ where: { id: user.id }, data: { googleSub, emailVerified: new Date() } });
  await audit({ actorId: user.id, action: "auth.login", entity: "user", entityId: user.id, after: { method: "google" } });
  return { ok: true, user };
}

// Siempre responde igual, exista o no el email, para no revelar quién tiene cuenta.
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(rawEmail) } });
  if (!user || user.deletedAt || user.status === "DISABLED") return;
  const token = await createVerificationToken(`password:${user.id}`, 30 * 60 * 1000);
  await enqueueEmail(emails.passwordReset(user.email, user.firstName, `${env.appUrl}/contrasena/${token}`));
  await audit({ actorId: user.id, action: "auth.password_reset_requested", entity: "user", entityId: user.id });
}

export async function sendInvitation(userId: string, actorId?: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 1 } });
  const token = await createVerificationToken(`password:${user.id}`, 7 * DAY);
  await enqueueEmail(emails.invitation(user.email, user.firstName, settings?.name ?? env.schoolName, `${env.appUrl}/contrasena/${token}`));
  await audit({ actorId, action: "user.invitation_sent", entity: "user", entityId: user.id });
}

export async function passwordTokenUser(token: string) {
  const userId = await peekVerificationToken(token, "password");
  return userId ? prisma.user.findUnique({ where: { id: userId }, select: { id: true, firstName: true, email: true } }) : null;
}

export async function resetPassword(token: string, password: string): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };
  const userId = await consumeVerificationToken(token, "password");
  if (!userId) return { ok: false, error: "El enlace venció o ya se usó. Pedí uno nuevo." };
  const user = await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password), emailVerified: new Date() } });
  await invalidateUserSessions(user.id);
  await audit({ actorId: user.id, action: "auth.password_set", entity: "user", entityId: user.id });
  const blocked = statusProblem(user);
  return blocked ? { ok: false, error: `Tu contraseña quedó guardada. ${blocked}` } : { ok: true, user };
}
