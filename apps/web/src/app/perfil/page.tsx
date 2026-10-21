import { ActionForm, SubmitButton } from "@/components/action-form";
import { Button, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { logoutEverywhereAction, saveThemeAction, sendPasswordLinkAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi perfil · Fertelligence" };

const themes = [
  { value: "SYSTEM", label: "Como el dispositivo" },
  { value: "LIGHT", label: "Claro" },
  { value: "DARK", label: "Oscuro" },
] as const;

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Mi perfil" subtitle={`${user.firstName} ${user.lastName} · ${user.email}`} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Tema">
          <ActionForm action={saveThemeAction}>
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Tema</legend>
              {themes.map((t) => (
                <label key={t.value} className="flex min-h-11 items-center gap-3 rounded-lg border border-line px-3">
                  <input type="radio" name="theme" value={t.value} defaultChecked={user.theme === t.value} className="size-4 accent-[var(--accent)]" />
                  {t.label}
                </label>
              ))}
            </fieldset>
            <SubmitButton>Guardar tema</SubmitButton>
          </ActionForm>
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Contraseña">
            <ActionForm action={sendPasswordLinkAction}>
              <p className="text-sm text-muted">Te mandamos por email un enlace para crear una contraseña nueva.</p>
              <SubmitButton variant="secondary" pendingLabel="Enviando…">Enviarme el enlace</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Sesiones">
            <form action={logoutEverywhereAction} className="flex flex-col gap-3">
              <p className="text-sm text-muted">Cierra tu sesión en todos los dispositivos, incluido este.</p>
              <Button type="submit" variant="danger">Cerrar sesión en todos lados</Button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
