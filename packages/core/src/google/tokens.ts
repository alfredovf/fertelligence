import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "../db";

// Tokens de Google guardados en la base, cifrados con AES-256-GCM (la clave está fuera de la base, en el .env).

function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("Falta TOKEN_ENCRYPTION_KEY para guardar tokens de Google.");
  const buf = Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : createHash("sha256").update(raw).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decrypt(sealed: string): string {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !data) throw new Error("Token cifrado inválido.");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export async function saveGoogleToken(userId: string, refreshToken: string, scopes: string[]) {
  const refreshTokenEnc = encrypt(refreshToken);
  await prisma.googleToken.upsert({ where: { userId }, create: { userId, refreshTokenEnc, scopes }, update: { refreshTokenEnc, scopes } });
}

export async function googleConnection(userId: string): Promise<{ scopes: string[] } | null> {
  const row = await prisma.googleToken.findUnique({ where: { userId } });
  return row ? { scopes: row.scopes } : null;
}

export async function disconnectGoogle(userId: string) {
  await prisma.googleToken.deleteMany({ where: { userId } });
  accessCache.delete(userId);
}

// Access tokens en memoria (duran una hora). Se renuevan con el refresh token.
const accessCache = new Map<string, { token: string; expires: number }>();

export async function accessTokenFor(userId: string, refresh: (refreshToken: string) => Promise<{ accessToken: string; expiresAt: Date }>): Promise<string> {
  const cached = accessCache.get(userId);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const row = await prisma.googleToken.findUnique({ where: { userId } });
  if (!row) throw new GoogleNotConnected();
  const { accessToken, expiresAt } = await refresh(decrypt(row.refreshTokenEnc));
  accessCache.set(userId, { token: accessToken, expires: expiresAt.getTime() });
  return accessToken;
}

export class GoogleNotConnected extends Error {
  constructor() {
    super("Primero conectá tu cuenta de Google Classroom.");
  }
}
