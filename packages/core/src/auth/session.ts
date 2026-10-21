import type { Role, User } from "@prisma/client";
import { prisma } from "../db";
import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "fertelligence_session";
const DAY = 24 * 60 * 60 * 1000;
export const SESSION_DAYS = 30;

export type SessionUser = Pick<User, "id" | "email" | "firstName" | "lastName" | "role" | "status" | "theme">;

// Crea una sesión y devuelve el token que va en la cookie. En la base queda solo su hash.
export async function createSession(userId: string): Promise<{ token: string; expires: Date }> {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * DAY);
  await prisma.session.create({ data: { sessionToken: sha256(token), userId, expires } });
  return { token, expires };
}

// Valida el token de la cookie. Renueva la sesión si le quedan menos de 15 días.
export async function validateSession(token: string): Promise<{ user: SessionUser; expires: Date } | null> {
  const session = await prisma.session.findUnique({
    where: { sessionToken: sha256(token) },
    include: { user: { select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, theme: true, deletedAt: true } } },
  });
  if (!session) return null;
  const { deletedAt, ...user } = session.user;
  if (session.expires.getTime() < Date.now() || deletedAt || user.status === "DISABLED") {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  let expires = session.expires;
  if (expires.getTime() - Date.now() < 15 * DAY) {
    expires = new Date(Date.now() + SESSION_DAYS * DAY);
    await prisma.session.update({ where: { id: session.id }, data: { expires } });
  }
  return { user, expires };
}

export async function invalidateSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { sessionToken: sha256(token) } });
}

export async function invalidateUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

export const homeForRole: Record<Role, string> = {
  ADMIN: "/admin",
  TEACHER: "/docente",
  STUDENT: "/alumno",
};
