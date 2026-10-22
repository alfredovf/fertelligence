import { taskTypeLabels, type TaskTypeName } from "@fertelligence/core";
import type { SessionUser } from "@fertelligence/core/auth/session";
import { prisma } from "@fertelligence/core/db";
import { aiAvailability, friendlyError, loadJobFor } from "@fertelligence/core/services/ai";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, LinkButton, Notice, PageHeader, Select } from "@/components/ui";
import { photoTaskAction, textTaskAction, transcribeAction } from "@/app/tareas-actions";
import { JobRefresher } from "./job-refresher";
import { TextSourceForm } from "./text-source-form";

// Pantallas de creación con IA (Gemini), compartidas por el docente y el administrador.

async function teacherContext(teacherId: string) {
  const [teacher, subjects] = await Promise.all([
    prisma.user.findUnique({ where: { id: teacherId }, select: { firstName: true, lastName: true } }),
    prisma.subject.findMany({ where: { archivedAt: null, teachers: { some: { teacherId } } }, orderBy: { name: "asc" } }),
  ]);
  return { name: teacher ? `${teacher.firstName} ${teacher.lastName}` : "", subjects };
}

function Banner({ user, name }: { user: SessionUser; name: string }) {
  return user.role === "ADMIN" ? <Notice tone="warn">Estás creando una tarea en nombre de {name}. Queda registrado con tu usuario.</Notice> : null;
}

export async function PhotoTaskView({ user, teacherId, basePath, backHref }: { user: SessionUser; teacherId: string; basePath: string; backHref: string }) {
  const [{ name, subjects }, availability] = await Promise.all([teacherContext(teacherId), aiAvailability()]);
  return (
    <>
      <PageHeader title="Crear desde una foto" subtitle="Sacale una foto a un ejercicio de un libro o una fotocopia. El sistema reconoce el tipo y lo arma; después lo revisás." back={{ href: backHref, label: "Nueva tarea" }} />
      <Banner user={user} name={name} />
      {!availability.available ? (
        <Notice tone="bad">{availability.reason}</Notice>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <ActionForm action={photoTaskAction.bind(null, teacherId, `${basePath}`)}>
              <Field label="Foto o PDF del ejercicio" hint="Hasta 3 archivos (por ejemplo, un ejercicio en dos páginas). JPG, PNG, HEIC o PDF, hasta 15 MB cada uno.">
                <Input type="file" name="photos" accept="image/*,application/pdf" capture="environment" multiple required className="py-2" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Materia">
                  <Select name="subjectId" required defaultValue="">
                    <option value="" disabled>
                      Elegí la materia
                    </option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Tipo de tarea">
                  <Select name="type" defaultValue="AUTO">
                    <option value="AUTO">Detectar automáticamente</option>
                    {(Object.keys(taskTypeLabels) as TaskTypeName[]).map((t) => (
                      <option key={t} value={t}>
                        {taskTypeLabels[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <label className="flex items-start gap-2">
                <input type="checkbox" name="solve" defaultChecked className="mt-1 size-4" />
                <span>Si el ejercicio no trae las respuestas, que la IA las proponga (las revisás vos).</span>
              </label>
              <SubmitButton pendingLabel="Subiendo…">Analizar foto</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Para que salga bien">
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
              <li>Buena luz, sin sombras ni reflejos.</li>
              <li>La hoja derecha y completa en la foto.</li>
              <li>Un ejercicio por tarea.</li>
              <li>Desde el celular, el botón abre la cámara.</li>
            </ul>
            <p className="mt-3 text-xs text-muted">A la inteligencia artificial solo se le envía la imagen del ejercicio. Tarda entre 20 segundos y un minuto.</p>
          </Card>
        </div>
      )}
    </>
  );
}

export async function TextTaskView({ user, teacherId, basePath, backHref }: { user: SessionUser; teacherId: string; basePath: string; backHref: string }) {
  const [{ name, subjects }, availability] = await Promise.all([teacherContext(teacherId), aiAvailability()]);
  return (
    <>
      <PageHeader title="Crear desde un texto" subtitle="Elegís el tipo y la cantidad, y se generan las preguntas con sus respuestas y explicaciones." back={{ href: backHref, label: "Nueva tarea" }} />
      <Banner user={user} name={name} />
      {!availability.available ? <Notice tone="bad">{availability.reason}</Notice> : <TextSourceForm subjects={subjects} action={textTaskAction.bind(null, teacherId, basePath)} transcribe={transcribeAction} />}
    </>
  );
}

export async function AiJobView({ user, jobId, basePath, backHref }: { user: SessionUser; jobId: string; basePath: string; backHref: string }) {
  const job = await loadJobFor(user, jobId);
  if (!job) notFound();
  const output = (job.output ?? {}) as { templateId?: string };
  if (job.status === "SUCCEEDED" && output.templateId) redirect(`${basePath}/${output.templateId}/items?ia=${job.id}`);

  if (job.status === "FAILED") {
    return (
      <>
        <PageHeader title="No pudimos armar la tarea" back={{ href: backHref, label: "Nueva tarea" }} />
        <Notice tone="bad">{friendlyError(job.error)}</Notice>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={backHref} variant="primary">
            Volver a intentar
          </LinkButton>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={job.kind === "OCR" ? "Analizando la foto…" : "Generando la tarea…"} back={{ href: backHref, label: "Nueva tarea" }} />
      <Card>
        <div className="flex items-center gap-4">
          <span className="size-6 animate-spin rounded-full border-4 border-accent-soft border-t-accent" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-bold">{job.kind === "OCR" ? "Leyendo el ejercicio y armando los ítems" : "Escribiendo las preguntas, las respuestas y las explicaciones"}</p>
            <p className="text-sm text-muted">Tarda entre 20 segundos y un minuto. Podés dejar esta pantalla abierta: cuando termine, se abre el editor.</p>
          </div>
          <span className="text-sm text-muted">
            <JobRefresher />
          </span>
        </div>
      </Card>
      <p className="text-sm text-muted">
        Si preferís, seguí con otra cosa: la tarea va a quedar en <Link href={basePath.replace(/\/ia$/, "") + "?ver=borradores"}>Borradores</Link>.
      </p>
    </>
  );
}

// Aviso arriba del editor cuando la tarea viene de la IA.
export async function AiReviewNotice({ jobId, templateId }: { jobId: string; templateId: string }) {
  const [job, sources] = await Promise.all([prisma.aiJob.findUnique({ where: { id: jobId } }), prisma.templateSource.findMany({ where: { templateId } })]);
  if (!job) return null;
  const out = (job.output ?? {}) as { warnings?: string[]; confidence?: number; detectedType?: string | null; type?: string };
  return (
    <Notice tone="warn">
      <b>Generada con inteligencia artificial: revisá cada ítem antes de asignarla.</b>
      {out.confidence !== undefined && out.detectedType && (
        <span>
          {" "}
          Tipo detectado: {taskTypeLabels[out.detectedType as TaskTypeName]} ({Math.round(out.confidence * 100)} % de confianza).
        </span>
      )}
      {out.warnings && out.warnings.length > 0 && (
        <ul className="mt-2 list-disc pl-5">
          {out.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {sources.length > 0 && (
        <p className="mt-2">
          Foto original:{" "}
          {sources.map((s, i) => (
            <a key={s.fileId} href={`/archivos/${s.fileId}`} target="_blank" rel="noreferrer" className="mr-2">
              ver {sources.length > 1 ? i + 1 : ""}
            </a>
          ))}
        </p>
      )}
    </Notice>
  );
}
