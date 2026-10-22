import { finishGoogleLogin, googleClient } from "@fertelligence/core/auth/google";
import { finishClassroomConnect } from "@fertelligence/core/google/classroom";
import { loginWithGoogle } from "@fertelligence/core/services/accounts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getCurrentUser, landingFor, startSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Vuelta de Google: puede ser el ingreso con Google o la conexión de Classroom (cookie google_flow).
export async function GET(request: NextRequest) {
  const client = googleClient();
  if (!client) redirect("/ingresar?error=google-config");
  const store = await cookies();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = store.get("google_oauth_state")?.value;
  const verifier = store.get("google_code_verifier")?.value;
  const flow = store.get("google_flow")?.value;
  const back = store.get("google_return")?.value ?? "/";
  for (const name of ["google_oauth_state", "google_code_verifier", "google_flow", "google_return"]) store.delete(name);
  const withParam = (path: string, param: string) => `${path}${path.includes("?") ? "&" : "?"}${param}`;

  if (flow === "classroom") {
    const user = await getCurrentUser();
    if (!user) redirect("/ingresar");
    if (!code || !state || state !== savedState || !verifier) redirect(withParam(back, "classroom=error"));
    try {
      await finishClassroomConnect(user.id, code, verifier);
    } catch (error) {
      console.error("[classroom]", error);
      redirect(withParam(back, "classroom=error"));
    }
    redirect(withParam(back, "classroom=conectado"));
  }

  if (!code || !state || !savedState || !verifier || state !== savedState) redirect("/ingresar?error=google");
  let identity: Awaited<ReturnType<typeof finishGoogleLogin>>;
  try {
    identity = await finishGoogleLogin(client, code, verifier);
  } catch (error) {
    console.error("[google]", error);
    redirect("/ingresar?error=google");
  }
  const result = await loginWithGoogle(identity.sub, identity.email, identity.emailVerified);
  if (!result.ok) {
    store.set("login_error", result.error, { httpOnly: true, sameSite: "lax", path: "/ingresar", maxAge: 60 });
    redirect("/ingresar");
  }
  await startSession(result.user.id);
  redirect(await landingFor(result.user));
}
