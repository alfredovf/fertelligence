import { decodeIdToken, generateCodeVerifier, generateState, Google } from "arctic";
import { env } from "../env";

// Ingreso con Google (OAuth 2.0 con PKCE). Solo se piden los permisos básicos;
// los de Classroom se piden aparte, recién cuando un docente o el administrador conecta Classroom.
export const GOOGLE_LOGIN_SCOPES = ["openid", "email", "profile"];

export function googleClient(): Google | null {
  const { clientId, clientSecret } = env.google;
  if (!clientId || !clientSecret) return null;
  return new Google(clientId, clientSecret, `${env.appUrl}/api/auth/google/callback`);
}

export function startGoogleLogin(client: Google) {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = client.createAuthorizationURL(state, codeVerifier, GOOGLE_LOGIN_SCOPES);
  url.searchParams.set("prompt", "select_account");
  return { url, state, codeVerifier };
}

export async function finishGoogleLogin(client: Google, code: string, codeVerifier: string) {
  const tokens = await client.validateAuthorizationCode(code, codeVerifier);
  const claims = decodeIdToken(tokens.idToken()) as { sub: string; email?: string; email_verified?: boolean };
  if (!claims.email) throw new Error("Google no devolvió el email.");
  return { sub: claims.sub, email: claims.email, emailVerified: Boolean(claims.email_verified) };
}
