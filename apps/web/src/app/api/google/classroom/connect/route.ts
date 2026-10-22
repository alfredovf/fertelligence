import { ADMIN_SCOPES, startClassroomConnect, TEACHER_SCOPES } from "@fertelligence/core/google/classroom";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Pide a Google los permisos de Classroom (solo lectura). Usa la misma dirección de retorno que el ingreso con Google.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role === "STUDENT") redirect("/ingresar");
  const back = request.nextUrl.searchParams.get("volver") ?? "/";
  const safeBack = back.startsWith("/") && !back.startsWith("//") ? back : "/";
  const scopes = user.role === "ADMIN" ? [...new Set([...TEACHER_SCOPES, ...ADMIN_SCOPES])] : TEACHER_SCOPES;
  let started: ReturnType<typeof startClassroomConnect>;
  try {
    started = startClassroomConnect(scopes);
  } catch {
    redirect(`${safeBack}${safeBack.includes("?") ? "&" : "?"}classroom=sin-configurar`);
  }
  const store = await cookies();
  const options = { httpOnly: true, secure: (process.env.APP_URL ?? "").startsWith("https://"), sameSite: "lax" as const, path: "/", maxAge: 600 };
  store.set("google_oauth_state", started.state, options);
  store.set("google_code_verifier", started.codeVerifier, options);
  store.set("google_flow", "classroom", options);
  store.set("google_return", safeBack, options);
  redirect(started.url.toString());
}
