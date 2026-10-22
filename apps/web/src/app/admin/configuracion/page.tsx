import { env } from "@fertelligence/core";
import { prisma } from "@fertelligence/core/db";
import { aiBudget } from "@fertelligence/core/services/ai";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Table } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { createPersonAction, saveSettingsAction, setPersonActiveAction } from "../actions";
import { PersonFields, StatusPill } from "../person-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración · Fertelligence" };

export default async function SettingsPage() {
  const me = await requireUser("ADMIN");
  const [settings, admins, budget] = await Promise.all([
    prisma.schoolSettings.findUniqueOrThrow({ where: { id: 1 }, include: { activeCycle: true } }),
    prisma.user.findMany({ where: { role: "ADMIN" }, orderBy: { lastName: "asc" } }),
    aiBudget(),
  ]);

  return (
    <>
      <PageHeader title="Configuración" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Escuela">
          <ActionForm action={saveSettingsAction}>
            <Field label="Nombre de la escuela">
              <Input name="name" defaultValue={settings.name} required maxLength={120} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Aprueba con (de 1 a 10)" hint="Se usa por defecto en cada tarea nueva.">
                <Input name="passGrade" type="number" min={1} max={10} step={1} defaultValue={settings.passGrade} required />
              </Field>
              <Field label="Tope mensual de IA (USD)" hint={budget.configured ? `Usado este mes: USD ${budget.spent.toFixed(2)} (${budget.percent} %). Al llegar al tope se pausan los métodos con IA hasta el mes siguiente.` : "Falta configurar la clave de Gemini."}>
                <Input name="aiMonthlyBudgetUsd" type="number" min={0} step="0.01" defaultValue={settings.aiMonthlyBudgetUsd.toString()} required />
              </Field>
            </div>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="googleLoginEnabled" defaultChecked={settings.googleLoginEnabled} className="size-5" />
              <span>
                Permitir ingreso con Google {!env.integrations.google && <span className="text-sm text-muted">(falta configurar las claves de Google)</span>}
              </span>
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="achievementsEnabled" defaultChecked={settings.achievementsEnabled} className="size-5" />
              Mostrar logros y rachas a los alumnos
            </label>
            <p className="text-sm text-muted">Ciclo lectivo activo: {settings.activeCycle?.year ?? "sin definir"}.</p>
            <SubmitButton>Guardar configuración</SubmitButton>
          </ActionForm>
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Administradores">
            <Table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <b>
                        {a.firstName} {a.lastName}
                      </b>
                      <div className="text-xs text-muted">{a.email}</div>
                    </td>
                    <td>
                      <StatusPill status={a.status} />
                    </td>
                    <td className="text-right">
                      {a.id !== me.id && (
                        <ActionForm action={setPersonActiveAction.bind(null, a.id, a.status === "DISABLED")} className="inline">
                          <SubmitButton variant="ghost">{a.status === "DISABLED" ? "Reactivar" : "Desactivar"}</SubmitButton>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card title="Nuevo administrador">
            <ActionForm action={createPersonAction.bind(null, "ADMIN")}>
              <PersonFields role="ADMIN" />
              <SubmitButton>Crear administrador</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
