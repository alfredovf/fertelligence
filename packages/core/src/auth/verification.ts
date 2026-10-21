import { prisma } from "../db";
import { randomToken, sha256 } from "./crypto";

// Enlaces de un solo uso: recuperar contraseña, invitación, consentimiento.
// identifier = "<propósito>:<id>", por ejemplo "password:3f2a…" o "consent:9c21…".
export async function createVerificationToken(identifier: string, ttlMs: number): Promise<string> {
  const token = randomToken();
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier } }), // un enlace vigente por propósito
    prisma.verificationToken.create({ data: { identifier, token: sha256(token), expires: new Date(Date.now() + ttlMs) } }),
  ]);
  return token;
}

// Devuelve el identifier si el token es válido, sin consumirlo (para mostrar la página).
export async function peekVerificationToken(token: string, prefix: string): Promise<string | null> {
  const row = await prisma.verificationToken.findUnique({ where: { token: sha256(token) } });
  if (!row || !row.identifier.startsWith(`${prefix}:`) || row.expires.getTime() < Date.now()) return null;
  return row.identifier.slice(prefix.length + 1);
}

// Igual que peek, pero lo borra: el enlace deja de servir.
export async function consumeVerificationToken(token: string, prefix: string): Promise<string | null> {
  const id = await peekVerificationToken(token, prefix);
  if (id === null) return null;
  await prisma.verificationToken.deleteMany({ where: { token: sha256(token) } });
  return id;
}

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
