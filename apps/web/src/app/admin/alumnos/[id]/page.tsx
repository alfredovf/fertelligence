import { prisma } from "@fertelligence/core/db";
import { RELATIONSHIPS } from "@fertelligence/core/services/consent";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, Notice, PageHeader, Pill, Select, Table } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { paperConsentAction, requestConsentAction, resendInvitationAction, revokeConsentAction, setPersonActiveAction, updatePersonAction } from "../../actions";
import { PersonFields, StatusPill } from "../../person-form";

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

export default async function StudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ creado?: string }> }) {
  await requireUser("ADMIN");
  const { id } = await params;
  const { creado } = await searchParams;
  const student = await prisma.user.findFirst({
    where: { id, role: "STUDENT" },
    include: {
      studentProfile: true,
      consents: { include: { legalDocument: true }, orderBy: { createdAt: "desc" } },
      studentAssignments: { where: { active: true }, include: { subject: true, teacher: true }, orderBy: { subject: { name: "asc" } } },
    },
  });
  if (!student) notFound();
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 1 } });
  const courses = await prisma.course.findMany({ where: { cycleId: settings?.activeCycleId ?? undefined }, orderBy: { name: "asc" } });
  const lastRequest = await prisma.auditLog.findFirst({ where: { entity: "user", entityId: student.id, action: { in: ["consent.request", "consent.reminder"] } }, orderBy: { createdAt: "desc" } });

  const valid = student.consents.find((c) => c.status === "GRANTED" && !c.revokedAt);
  const refused = !valid && student.consents.find((c) => c.status === "REFUSED");
  const disabled = student.status === "DISABLED";

  return (
    <>
      <PageHeader title={`${student.firstName} ${student.lastName}`} subtitle={<StatusPill status={student.status} />} back={{ href: "/admin/alumnos", label: "Alumnos" }} />
      {creado && (
        <Notice tone="ok">
          Creamos al alumno.{" "}
          {student.studentProfile?.familyContactEmail ? "Le enviamos el pedido de consentimiento a la familia." : "Falta el consentimiento: cargá el email de la familia o registralo en papel."}
        </Notice>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card title="Datos">
            <ActionForm action={updatePersonAction.bind(null, student.id)}>
              <PersonFields role="STUDENT" person={student} courses={courses} />
              <SubmitButton>Guardar cambios</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Docentes asignados" actions={<Link href="/admin/asignaciones">Cambiar en Asignaciones</Link>}>
            <Table>
              <thead>
                <tr>
                  <th>Materia</th>
                  <th>Docente</th>
                </tr>
              </thead>
              <tbody>
                {student.studentAssignments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.subject.name}</td>
                    <td>
                      {a.teacher.firstName} {a.teacher.lastName}
                    </td>
                  </tr>
                ))}
                {student.studentAssignments.length === 0 && (
                  <tr>
                    <td colSpan={2} className="text-center text-muted">
                      Todavía no tiene docentes asignados.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Consentimiento de la familia">
            {valid ? (
              <div className="flex flex-col gap-2 text-sm">
                <Pill tone="ok">Vigente</Pill>
                <p>
                  {valid.method === "PAPER" ? "En papel" : "Online"}, dado por <b>{valid.grantorName}</b> ({valid.grantorRelationship}) el {dateTime.format(valid.decidedAt)}.
                </p>
                <p className="text-muted">Política de privacidad versión {valid.legalDocument.version}.</p>
                {valid.evidenceFileId && (
                  <a href={`/admin/archivos/${valid.evidenceFileId}`} target="_blank" rel="noreferrer">
                    Ver formulario firmado
                  </a>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer font-bold text-bad">Registrar revocación</summary>
                  <ActionForm action={revokeConsentAction.bind(null, student.id)} className="mt-2 flex flex-col gap-2">
                    <p className="text-muted">Usalo cuando la familia pide retirar el consentimiento. La cuenta del alumno se desactiva.</p>
                    <label className="flex gap-2">
                      <input type="checkbox" name="confirm" className="mt-1" /> Confirmo que la familia pidió revocar el consentimiento.
                    </label>
                    <SubmitButton variant="danger">Registrar revocación</SubmitButton>
                  </ActionForm>
                </details>
              </div>
            ) : (
              <div className="flex flex-col gap-4 text-sm">
                {refused ? (
                  <Notice tone="bad">
                    {refused.grantorName} ({refused.grantorRelationship}) no dio el consentimiento el {dateTime.format(refused.decidedAt)}.
                  </Notice>
                ) : (
                  <p>
                    <Pill tone="warn">Pendiente</Pill>{" "}
                    {lastRequest ? `Último pedido enviado el ${dateTime.format(lastRequest.createdAt)} a ${student.studentProfile?.familyContactEmail ?? "la familia"}.` : "Todavía no se envió el pedido."}
                  </p>
                )}
                <ActionForm action={requestConsentAction.bind(null, student.id)}>
                  <SubmitButton variant="secondary" pendingLabel="Enviando…">
                    {lastRequest ? "Reenviar pedido por email" : "Enviar pedido por email"}
                  </SubmitButton>
                </ActionForm>
                <details>
                  <summary className="cursor-pointer font-bold">Registrar consentimiento en papel</summary>
                  <ActionForm action={paperConsentAction.bind(null, student.id)} className="mt-3 flex flex-col gap-3">
                    <Field label="Quién firmó">
                      <Input name="grantorName" defaultValue={student.studentProfile?.familyContactName ?? ""} required />
                    </Field>
                    <Field label="Vínculo con el alumno">
                      <Select name="grantorRelationship" required defaultValue="">
                        <option value="" disabled>
                          Elegí una opción
                        </option>
                        {RELATIONSHIPS.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Fecha de firma">
                      <Input name="signedOn" type="date" defaultValue={today()} max={today()} required />
                    </Field>
                    <Field label="Foto o PDF del formulario firmado (opcional)" hint="JPG, PNG, HEIC o PDF, hasta 15 MB.">
                      <Input name="evidence" type="file" accept="image/*,application/pdf" className="py-2" />
                    </Field>
                    <SubmitButton>Registrar consentimiento</SubmitButton>
                  </ActionForm>
                </details>
              </div>
            )}
          </Card>
          <Card title="Acceso">
            <div className="flex flex-col gap-3">
              {student.status === "ACTIVE" && (
                <ActionForm action={resendInvitationAction.bind(null, student.id)}>
                  <SubmitButton variant="secondary" pendingLabel="Enviando…">
                    Reenviar email de bienvenida
                  </SubmitButton>
                </ActionForm>
              )}
              <ActionForm action={setPersonActiveAction.bind(null, student.id, disabled)}>
                <SubmitButton variant={disabled ? "secondary" : "danger"}>{disabled ? "Reactivar cuenta" : "Desactivar cuenta"}</SubmitButton>
              </ActionForm>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
