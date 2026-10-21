import { PASSWORD_MIN_LENGTH } from "@fertelligence/core/auth/password";
import { passwordTokenUser } from "@fertelligence/core/services/accounts";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, LinkButton, Notice } from "@/components/ui";
import { resetPasswordAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Crear contraseña · Fertelligence" };

export default async function SetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await passwordTokenUser(token);

  if (!user) {
    return (
      <>
        <h1 className="font-display text-2xl font-semibold">El enlace no es válido</h1>
        <Notice tone="bad">Venció o ya se usó. Podés pedir uno nuevo.</Notice>
        <LinkButton href="/recuperar" variant="primary">
          Pedir un enlace nuevo
        </LinkButton>
      </>
    );
  }

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-semibold">Hola, {user.firstName}</h1>
        <p className="text-muted">Creá la contraseña para {user.email}.</p>
      </div>
      <ActionForm action={resetPasswordAction}>
        <input type="hidden" name="token" value={token} />
        <Field label="Contraseña nueva" hint={`Al menos ${PASSWORD_MIN_LENGTH} caracteres.`}>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
        </Field>
        <Field label="Repetí la contraseña">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
        </Field>
        <SubmitButton>Guardar y entrar</SubmitButton>
      </ActionForm>
    </>
  );
}
