import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, LinkButton } from "@/components/ui";
import { requestResetAction } from "../actions";

export const metadata = { title: "Recuperar contraseña · Fertelligence" };

export default function RecoverPage() {
  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-semibold">Crear una contraseña nueva</h1>
        <p className="text-muted">Te mandamos un enlace por email. Vence en 30 minutos.</p>
      </div>
      <ActionForm action={requestResetAction}>
        <Field label="Email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton pendingLabel="Enviando…">Enviar enlace</SubmitButton>
      </ActionForm>
      <LinkButton href="/ingresar" variant="ghost">
        Volver a ingresar
      </LinkButton>
    </>
  );
}
