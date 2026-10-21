import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { env } from "./env";
import { getStorage } from "./storage";

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

// Firmas de los formatos permitidos: se verifica el contenido real, no la extensión.
const signatures: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
  { mime: "image/heic", test: (b) => b.subarray(4, 8).toString("ascii") === "ftyp" && ["heic", "heix", "mif1", "msf1"].includes(b.subarray(8, 12).toString("ascii")) },
  { mime: "application/pdf", test: (b) => b.subarray(0, 5).toString("ascii") === "%PDF-" },
];

export function detectMime(buffer: Buffer): string | null {
  return signatures.find((s) => s.test(buffer))?.mime ?? null;
}

export async function storeFile(buffer: Buffer, uploadedById: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (buffer.length === 0) return { ok: false, error: "El archivo está vacío." };
  if (buffer.length > MAX_FILE_BYTES) return { ok: false, error: "El archivo supera los 15 MB." };
  const mime = detectMime(buffer);
  if (!mime) return { ok: false, error: "Solo se aceptan imágenes (JPG, PNG, WebP, HEIC) o PDF." };
  const storageKey = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}`;
  await getStorage().send(new PutObjectCommand({ Bucket: env.storage.bucket, Key: storageKey, Body: buffer, ContentType: mime }));
  const file = await prisma.file.create({ data: { storageKey, mimeType: mime, sizeBytes: buffer.length, uploadedById } });
  return { ok: true, id: file.id };
}

export async function readFile(id: string) {
  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) return null;
  const object = await getStorage().send(new GetObjectCommand({ Bucket: env.storage.bucket, Key: file.storageKey }));
  return { file, body: object.Body };
}
