import { finishGoogleLogin, googleClient } from "@fertelligence/core/auth/google";
import { loginWithGoogle } from "@fertelligence/core/services/accounts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { landingFor, startSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const client = googleClient();
  if (!client) redirect("/ingresar?error=google-config");
  const store = await cookies();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = store.get("google_oauth_state")?.value;
  const verifier = store.get("google_code_verifier")?.value;
  store.delete("google_oauth_state");
  store.delete("google_code_verifier");
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
