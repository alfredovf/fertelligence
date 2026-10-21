import { prisma } from "@fertelligence/core/db";
import { canViewFile, readFile } from "@fertelligence/core/files";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Archivos privados: imágenes de tareas y formularios de consentimiento firmados.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Tenés que ingresar para ver este archivo.", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("No encontramos el archivo.", { status: 404 });

  // Los formularios de consentimiento son datos de la familia: solo los ve la administración.
  const isConsentEvidence = (await prisma.consent.count({ where: { evidenceFileId: id } })) > 0;
  const allowed = isConsentEvidence ? user.role === "ADMIN" : await canViewFile(user, id);
  if (!allowed) return new Response("No tenés permiso para ver este archivo.", { status: 403 });

  const result = await readFile(id).catch(() => null);
  if (!result?.body) return new Response("No encontramos el archivo.", { status: 404 });
  const bytes = await result.body.transformToByteArray();
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": result.file.mimeType, "Content-Disposition": "inline", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
