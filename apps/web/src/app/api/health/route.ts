import { checkDatabase, checkStorage } from "@fertelligence/core/health";

export const dynamic = "force-dynamic";

// Para el healthcheck de Docker y, más adelante, de Cloud Run. No depende del worker.
export async function GET() {
  const [database, storage] = await Promise.all([checkDatabase(), checkStorage()]);
  const ok = database.ok && storage.ok;
  return Response.json({ ok, database, storage }, { status: ok ? 200 : 503 });
}
