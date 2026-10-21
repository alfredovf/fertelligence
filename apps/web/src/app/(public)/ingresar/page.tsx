import { env } from "@fertelligence/core";
import { prisma } from "@fertelligence/core/db";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Notice } from "@/components/ui";
import { getCurrentUser, landingFor } from "@/lib/session";
import { loginAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ingresar · Fertelligence" };

const googleErrors: Record<string, string> = {
  google: "No pudimos completar el ingreso con Google. Probá de nuevo.",
  "google-config": "El ingreso con Google todavía no está configurado en esta escuela.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect(await landingFor(user));
  const { error } = await searchParams;
  // El ingreso con Google deja su mensaje de error en una cookie de 60 segundos (no en la URL).
  const flash = (await cookies()).get("login_error")?.value;
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 1 } });
  const googleAvailable = env.integrations.google && (settings?.googleLoginEnabled ?? true);

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-semibold">Ingresar</h1>
        <p className="text-muted">{settings?.name ?? env.schoolName}</p>
      </div>
      {error && googleErrors[error] && <Notice tone="bad">{googleErrors[error]}</Notice>}
      {!error && flash && <Notice tone="bad">{flash}</Notice>}

      {googleAvailable && (
        <>
          <a href="/api/auth/google" className="inline-flex min-h-12 items-center justify-center gap-3 rounded-xl border border-line bg-paper px-4 text-base font-bold text-ink no-underline hover:border-muted">
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6C12.4 13.6 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.4c-.5 2.9-2.1 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-16.6z" />
              <path fill="#FBBC05" d="M10.5 28.8c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8l-7.8-6C1 16.5 0 20.1 0 24s1 7.5 2.7 10.8l7.8-6z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.2-8.4 2.2-6.3 0-11.6-4.1-13.5-9.7l-7.8 6C6.6 42.6 14.6 48 24 48z" />
            </svg>
            Continuar con Google
          </a>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="h-px flex-1 bg-line" />o con tu email<span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <ActionForm action={loginAction}>
        <Field label="Email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Contraseña">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <SubmitButton pendingLabel="Ingresando…">Ingresar</SubmitButton>
      </ActionForm>
      <p className="text-center text-sm">
        <Link href="/recuperar">Olvidé mi contraseña</Link>
      </p>
      <p className="rounded-lg border border-line bg-sunk p-3 text-sm text-muted">
        Solo pueden entrar las personas que la escuela dio de alta. Si es tu primera vez, buscá el email de bienvenida para crear tu contraseña.
      </p>
    </>
  );
}
