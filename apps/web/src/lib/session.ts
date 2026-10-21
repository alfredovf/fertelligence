import "server-only";
import type { Role } from "@prisma/client";
import { createSession, homeForRole, invalidateSession, SESSION_COOKIE, validateSession, type SessionUser } from "@fertelligence/core/auth/session";
import { prisma } from "@fertelligence/core/db";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await validateSession(token);
  return result?.user ?? null;
});

// Exige sesión (y uno de los roles, si se indican). Si falta, redirige.
export async function requireUser(...roles: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/ingresar");
  if (roles.length && !roles.includes(user.role)) redirect(homeForRole[user.role]);
  return user;
}

// Para server actions: lanza en vez de redirigir si no hay permiso.
export async function requireActionUser(...roles: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || (roles.length && !roles.includes(user.role))) throw new Error("No tenés permiso para hacer esto.");
  return user;
}

export async function startSession(userId: string): Promise<void> {
  const { token, expires } = await createSession(userId);
  const secure = (process.env.APP_URL ?? "").startsWith("https://");
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", expires });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSession(token);
  store.delete(SESSION_COOKIE);
}

// Adónde va el usuario al entrar: primero a aceptar los términos vigentes, después a su inicio.
export async function landingFor(user: { id: string; role: Role }): Promise<string> {
  const terms = await prisma.legalDocument.findFirst({ where: { type: "TERMS", effectiveFrom: { lte: new Date() } }, orderBy: { effectiveFrom: "desc" } });
  if (terms) {
    const accepted = await prisma.termsAcceptance.findUnique({ where: { userId_legalDocumentId: { userId: user.id, legalDocumentId: terms.id } } });
    if (!accepted) return "/terminos";
  }
  return homeForRole[user.role];
}

export async function requestMeta() {
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null, userAgent: h.get("user-agent") };
}
