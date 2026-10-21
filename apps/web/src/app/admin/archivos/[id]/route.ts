import { readFile } from "@fertelligence/core/files";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Archivos privados (por ahora, formularios de consentimiento firmados): solo para administradores.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return new Response("No tenés permiso para ver este archivo.", { status: 403 });
  const { id } = await params;
  const result = await readFile(id).catch(() => null);
  if (!result?.body) return new Response("No encontramos el archivo.", { status: 404 });
  const bytes = await result.body.transformToByteArray();
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": result.file.mimeType, "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
