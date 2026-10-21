import { googleClient, startGoogleLogin } from "@fertelligence/core/auth/google";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Inicio del ingreso con Google: guarda state y code verifier en cookies cortas y redirige a Google.
export async function GET() {
  const client = googleClient();
  if (!client) redirect("/ingresar?error=google-config");
  const { url, state, codeVerifier } = startGoogleLogin(client);
  const store = await cookies();
  const options = { httpOnly: true, secure: (process.env.APP_URL ?? "").startsWith("https://"), sameSite: "lax" as const, path: "/", maxAge: 600 };
  store.set("google_oauth_state", state, options);
  store.set("google_code_verifier", codeVerifier, options);
  redirect(url.toString());
}
