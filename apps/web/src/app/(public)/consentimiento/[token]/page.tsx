import { consentContext, RELATIONSHIPS } from "@fertelligence/core/services/consent";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PrivacySummary } from "@/components/privacy-summary";
import { Card, Field, Input, Notice, Select } from "@/components/ui";
import { consentAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consentimiento · Fertelligence" };

export default async function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const context = await consentContext(token);

  if (!context) {
    return (
      <>
        <h1 className="font-display text-2xl font-semibold">El enlace no es válido</h1>
        <Notice tone="bad">Venció o ya se usó. Si todavía no diste tu respuesta, pedile a la escuela que te envíe un enlace nuevo.</Notice>
      </>
    );
  }

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-semibold">Consentimiento para el uso de Fertelligence</h1>
        <p className="text-muted">
          {context.school} · Alumno: {context.studentName}
          {context.course && ` · Curso: ${context.course}`}
        </p>
      </div>

      <Card title="En pocas palabras">
        <PrivacySummary school={context.school} student={context.studentName} />
        <p className="mt-3 text-sm">
          <Link href="/privacidad" target="_blank">
            Leer la política de privacidad completa (versión {context.policyVersion})
          </Link>
        </p>
      </Card>

      <ActionForm action={consentAction}>
        <input type="hidden" name="token" value={token} />
        <Field label="Tu nombre y apellido">
          <Input id="grantorName" name="grantorName" defaultValue={context.contactName} autoComplete="name" required />
        </Field>
        <Field label="Tu vínculo con el alumno">
          <Select id="grantorRelationship" name="grantorRelationship" required defaultValue="">
            <option value="" disabled>
              Elegí una opción
            </option>
            {RELATIONSHIPS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label="Email">
          <Input value={context.contactEmail} readOnly disabled />
        </Field>

        <fieldset className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-4">
          <legend className="px-1 text-sm font-bold text-muted">Declaraciones</legend>
          {context.statements.map((statement, i) => (
            <label key={i} className="flex gap-3 text-sm">
              <input type="checkbox" name={`statement-${i}`} className="mt-1 size-5 shrink-0 accent-[var(--accent)]" />
              <span>{statement}</span>
            </label>
          ))}
        </fieldset>

        <input type="hidden" name="decision" value="grant" />
        <SubmitButton pendingLabel="Registrando…">Doy mi consentimiento</SubmitButton>
      </ActionForm>

      <details className="rounded-xl border border-line bg-paper p-4">
        <summary className="cursor-pointer font-bold">No doy mi consentimiento</summary>
        <ActionForm action={consentAction} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="decision" value="refuse" />
          <p className="text-sm text-muted">Si no das tu consentimiento, {context.studentName} no va a poder usar Fertelligence. Le avisamos a la escuela.</p>
          <Field label="Tu nombre y apellido">
            <Input name="grantorName" defaultValue={context.contactName} required />
          </Field>
          <Field label="Tu vínculo con el alumno">
            <Select name="grantorRelationship" required defaultValue="">
              <option value="" disabled>
                Elegí una opción
              </option>
              {RELATIONSHIPS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <label className="flex gap-3 text-sm">
            <input type="checkbox" name="confirmRefuse" className="mt-1 size-5 shrink-0" />
            <span>Confirmo que no doy mi consentimiento.</span>
          </label>
          <SubmitButton variant="danger">No doy mi consentimiento</SubmitButton>
        </ActionForm>
      </details>
    </>
  );
}
