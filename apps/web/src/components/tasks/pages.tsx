import type { Prisma, TaskStatus } from "@prisma/client";
import { taskTypeLabels, type EditorItem, type TaskTypeName } from "@fertelligence/core";
import type { SessionUser } from "@fertelligence/core/auth/session";
import { prisma } from "@fertelligence/core/db";
import { assignableStudents, isEditable, loadTemplateFor, ownedBy, ownerOf, readSettings, taskStatusLabels } from "@fertelligence/core/services/tasks";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, Field, Input, LinkButton, Notice, PageHeader, Pill, Table } from "@/components/ui";
import { bankAction, createTaskAction, deleteDraftAction, duplicateAction, extendDueAction, publishAction, saveItemsAction, updateMetaAction, uploadImageAction } from "@/app/tareas-actions";
import { defaultDates, formatDate, formatDateTime, toLocalInput } from "@/lib/dates";
import { ItemEditor } from "./item-editor";
import { StudentItemPreview } from "./task-render";
import { TaskMetaFields } from "./meta-fields";

// Pantallas de armado de tareas, compartidas por el docente y el administrador (que actúa en nombre de un docente).

const statusTone: Record<TaskStatus, "accent" | "ok" | "warn" | "bad" | "muted"> = {
  DRAFT: "muted",
  SCHEDULED: "muted",
  NEW: "accent",
  IN_PROGRESS: "accent",
  OVERDUE: "bad",
  COMPLETED: "warn",
  CORRECTED: "ok",
  REDO: "warn",
};

export function TaskStatusPill({ status }: { status: TaskStatus }) {
  return <Pill tone={statusTone[status]}>{taskStatusLabels[status]}</Pill>;
}

function OnBehalfBanner({ user, ownerName }: { user: SessionUser; ownerName: string }) {
  if (user.role !== "ADMIN") return null;
  return <Notice tone="warn">Estás trabajando en nombre de {ownerName}. Todo lo que hagas queda registrado con tu usuario.</Notice>;
}

async function ownerName(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
  return u ? `${u.firstName} ${u.lastName}` : "";
}

async function teacherSubjects(teacherId: string) {
  return prisma.subject.findMany({ where: { archivedAt: null, teachers: { some: { teacherId } } }, orderBy: { name: "asc" } });
}

// ---------- Lista ----------

export async function TaskListView({ ownerId, basePath, tab }: { ownerId: string | null; basePath: string; tab?: string }) {
  const where: Prisma.TaskTemplateWhereInput = {
    ...(ownerId ? ownedBy(ownerId) : {}),
    ...(tab === "borradores" ? { tasks: { none: {} } } : tab === "banco" ? { inBank: true } : { tasks: { some: {} } }),
  };
  const templates = await prisma.taskTemplate.findMany({
    where,
    include: { subject: true, _count: { select: { items: true } }, tasks: { select: { status: true, dueAt: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const owners = ownerId ? new Map() : new Map((await prisma.user.findMany({ where: { id: { in: templates.map(ownerOf) } }, select: { id: true, firstName: true, lastName: true } })).map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const tabs = [
    { key: "", label: "Asignadas" },
    { key: "borradores", label: "Borradores" },
    { key: "banco", label: "Banco de tareas" },
  ];
  const current = tab ?? "";

  return (
    <>
      <nav aria-label="Vista" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link key={t.key} href={t.key ? `${basePath}?ver=${t.key}` : basePath} className={`rounded-full border px-3 py-1 text-sm no-underline ${current === t.key ? "border-accent bg-accent-soft font-bold text-accent" : "border-line text-ink"}`}>
            {t.label}
          </Link>
        ))}
      </nav>
      {templates.length === 0 ? (
        <EmptyState>
          {current === "banco" ? "Todavía no guardaste tareas en el banco. Desde el detalle de una tarea tocá Guardar en el banco." : current === "borradores" ? "No hay borradores." : "Todavía no hay tareas asignadas."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Tarea</th>
              {!ownerId && <th>Docente</th>}
              <th>Tipo</th>
              <th className="text-right">Ítems</th>
              <th>Alumnos</th>
              <th>Entrega</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => {
              const counts = t.tasks.reduce<Partial<Record<TaskStatus, number>>>((acc, task) => ({ ...acc, [task.status]: (acc[task.status] ?? 0) + 1 }), {});
              const nextDue = t.tasks.map((x) => x.dueAt).sort((a, b) => a.getTime() - b.getTime())[0];
              return (
                <tr key={t.id}>
                  <td>
                    <Link href={`${basePath}/${t.id}`} className="font-bold">
                      {t.title}
                    </Link>
                    <div className="text-xs text-muted">
                      {t.subject.name}
                      {t.inBank && " · en el banco"}
                    </div>
                  </td>
                  {!ownerId && <td>{owners.get(ownerOf(t))}</td>}
                  <td>{taskTypeLabels[t.type]}</td>
                  <td className="text-right">{t._count.items}</td>
                  <td>
                    {t.tasks.length === 0 ? (
                      <Pill>Borrador</Pill>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(Object.entries(counts) as [TaskStatus, number][]).map(([s, n]) => (
                          <Pill key={s} tone={statusTone[s]}>
                            {n} {taskStatusLabels[s].toLowerCase()}
                          </Pill>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap">{nextDue ? formatDate(nextDue) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}

// ---------- Nueva tarea ----------

export async function NewTaskView({ user, teacherId, basePath, backHref }: { user: SessionUser; teacherId: string; basePath: string; backHref: string }) {
  const subjects = await teacherSubjects(teacherId);
  const name = await ownerName(teacherId);
  const methods = [
    { key: "form", title: "Formulario", text: "Elegís el tipo y cargás cada pregunta, la respuesta correcta y la explicación.", active: true },
    { key: "photo", title: "Desde una foto", text: "Sacale una foto a un ejercicio y el sistema lo arma. Llega en la etapa 5.", active: false },
    { key: "text", title: "Desde un texto", text: "Pegá o dictá un texto y se generan las preguntas. Llega en la etapa 5.", active: false },
    { key: "classroom", title: "Desde Google Classroom", text: "Importá un material o cuestionario. Llega en la etapa 6.", active: false },
  ];
  return (
    <>
      <PageHeader title="Nueva tarea" back={{ href: backHref, label: "Tareas" }} />
      <OnBehalfBanner user={user} ownerName={name} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {methods.map((m) => (
          <div key={m.key} className={`rounded-xl border p-4 ${m.active ? "border-2 border-accent bg-accent-soft" : "border-line bg-paper opacity-70"}`}>
            <div className="font-display font-semibold">{m.title}</div>
            <p className="text-sm text-muted">{m.text}</p>
            {!m.active && <Pill>Próximamente</Pill>}
          </div>
        ))}
      </div>
      {subjects.length === 0 ? (
        <Notice tone="bad">{user.role === "ADMIN" ? `${name} no tiene materias asignadas.` : "No tenés materias asignadas."} La administración las carga en la ficha del docente.</Notice>
      ) : (
        <Card title="1. Datos de la tarea" className="max-w-3xl">
          <ActionForm action={createTaskAction.bind(null, teacherId, basePath)}>
            <TaskMetaFields subjects={subjects} />
            <SubmitButton>Siguiente: cargar ítems</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </>
  );
}

// ---------- Ítems ----------

export async function TaskItemsView({ user, templateId, basePath }: { user: SessionUser; templateId: string; basePath: string }) {
  const template = await loadTemplateFor(user, templateId);
  if (!template) notFound();
  const [editable, subjects, name, assigned] = await Promise.all([isEditable(templateId), teacherSubjects(ownerOf(template)), ownerName(ownerOf(template)), prisma.task.count({ where: { templateId } })]);
  const items: EditorItem[] = template.items.map((i) => ({ content: i.content, correct: i.correctAnswer, maxPoints: Number(i.maxPoints), explanation: i.explanation ?? "", imageFileId: i.imageFileId }));
  const settings = readSettings(template.settings);

  return (
    <>
      <PageHeader
        title={template.title}
        subtitle={`${taskTypeLabels[template.type]} · ${template.subject.name}`}
        back={{ href: `${basePath}/${template.id}`, label: "Detalle de la tarea" }}
        actions={
          <>
            <LinkButton href={`${basePath}/${template.id}/vista-previa`}>Vista previa</LinkButton>
            <LinkButton href={`${basePath}/${template.id}/asignar`} variant="primary">
              {assigned ? "Asignar a más alumnos" : "Siguiente: asignar"}
            </LinkButton>
          </>
        }
      />
      <OnBehalfBanner user={user} ownerName={name} />
      <details className="rounded-xl border border-line bg-paper p-4">
        <summary className="cursor-pointer font-display font-semibold">Datos de la tarea</summary>
        <ActionForm action={updateMetaAction.bind(null, template.id)} className="mt-3 flex flex-col gap-4">
          <input type="hidden" name="type" value={template.type} />
          <TaskMetaFields subjects={subjects} typeLocked defaults={{ title: template.title, instructions: template.instructions, subjectId: template.subjectId, type: template.type as TaskTypeName, settings }} />
          <SubmitButton>Guardar datos</SubmitButton>
        </ActionForm>
      </details>
      <ItemEditor type={template.type as TaskTypeName} initialItems={items} save={saveItemsAction.bind(null, template.id)} upload={uploadImageAction} readOnly={!editable} />
    </>
  );
}

// ---------- Asignar ----------

export async function TaskAssignView({ user, templateId, basePath }: { user: SessionUser; templateId: string; basePath: string }) {
  const template = await loadTemplateFor(user, templateId);
  if (!template) notFound();
  const [students, settings, name] = await Promise.all([assignableStudents(templateId), prisma.schoolSettings.findUnique({ where: { id: 1 } }), ownerName(ownerOf(template))]);
  const dates = defaultDates();
  const available = students.filter((s) => !s.taskStatus);

  return (
    <>
      <PageHeader title={`Asignar: ${template.title}`} subtitle={`${template.subject.name} · ${template.items.length} ${template.items.length === 1 ? "ítem" : "ítems"}`} back={{ href: `${basePath}/${template.id}/items`, label: "Ítems" }} />
      <OnBehalfBanner user={user} ownerName={name} />
      {template.items.length === 0 ? (
        <Notice tone="bad">
          Primero cargá al menos un ítem. <Link href={`${basePath}/${template.id}/items`}>Ir a los ítems</Link>
        </Notice>
      ) : students.length === 0 ? (
        <Notice tone="bad">No hay alumnos asignados a {user.role === "ADMIN" ? name : "vos"} en {template.subject.name}. La administración los asigna en Asignaciones.</Notice>
      ) : (
        <ActionForm action={publishAction.bind(null, template.id, basePath)}>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card title="Alumnos">
              <p className="mb-3 text-sm text-muted">Se crea una tarea independiente para cada alumno, con su propia entrega y su nota.</p>
              <div className="flex flex-col gap-1">
                {students.map((s) => (
                  <label key={s.assignmentId} className={`flex min-h-11 items-center gap-3 rounded-lg border border-line px-3 ${s.taskStatus ? "opacity-60" : "cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-soft"}`}>
                    <input type="checkbox" name="assignmentIds" value={s.assignmentId} disabled={Boolean(s.taskStatus)} defaultChecked={!s.taskStatus && !s.pending} className="size-5" />
                    <span className="flex-1">
                      {s.name} <span className="text-sm text-muted">· {s.course}</span>
                    </span>
                    {s.taskStatus ? <TaskStatusPill status={s.taskStatus} /> : s.pending ? <Pill tone="warn">Sin consentimiento</Pill> : null}
                  </label>
                ))}
              </div>
              {available.length === 0 && <p className="mt-3 text-sm text-muted">Todos los alumnos ya tienen esta tarea.</p>}
            </Card>
            <Card title="Fechas y aprobación">
              <div className="flex flex-col gap-4">
                <Field label="Disponible desde" hint="Antes de esta fecha el alumno no la ve.">
                  <Input type="datetime-local" name="startsAt" defaultValue={dates.startsAt} required />
                </Field>
                <Field label="Fecha de entrega" hint="Después se puede entregar igual, pero queda fuera de término.">
                  <Input type="datetime-local" name="dueAt" defaultValue={dates.dueAt} required />
                </Field>
                <Field label="Aprueba con (de 1 a 10)">
                  <Input type="number" name="passGrade" min={1} max={10} defaultValue={settings?.passGrade ?? 7} required />
                </Field>
                <SubmitButton pendingLabel="Asignando…">Asignar tarea</SubmitButton>
              </div>
            </Card>
          </div>
        </ActionForm>
      )}
    </>
  );
}

// ---------- Detalle ----------

export async function TaskDetailView({ user, templateId, basePath, assignedCount }: { user: SessionUser; templateId: string; basePath: string; assignedCount?: string }) {
  const template = await loadTemplateFor(user, templateId);
  if (!template) notFound();
  const [tasks, editable, name] = await Promise.all([
    prisma.task.findMany({ where: { templateId }, include: { assignment: { include: { student: { include: { studentProfile: { include: { course: true } } } } } }, attempts: { orderBy: { number: "desc" }, take: 1, include: { result: true } } }, orderBy: { assignment: { student: { lastName: "asc" } } } }),
    isEditable(templateId),
    ownerName(ownerOf(template)),
  ]);
  const settings = readSettings(template.settings);
  const total = template.items.reduce((s, i) => s + Number(i.maxPoints), 0);
  const latestDue = tasks.map((t) => t.dueAt).sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <>
      <PageHeader
        title={template.title}
        subtitle={`${taskTypeLabels[template.type]} · ${template.subject.name} · ${template.items.length} ${template.items.length === 1 ? "ítem" : "ítems"} · ${total} puntos`}
        back={{ href: basePath, label: "Tareas" }}
        actions={
          <>
            <LinkButton href={`/tareas/${template.id}/imprimir`} target="_blank">
              Imprimir
            </LinkButton>
            <LinkButton href={`${basePath}/${template.id}/vista-previa`}>Vista previa</LinkButton>
            <LinkButton href={`${basePath}/${template.id}/items`}>{editable ? "Editar" : "Ver ítems"}</LinkButton>
            <LinkButton href={`${basePath}/${template.id}/asignar`} variant="primary">
              {tasks.length ? "Asignar a más alumnos" : "Asignar"}
            </LinkButton>
          </>
        }
      />
      <OnBehalfBanner user={user} ownerName={name} />
      {assignedCount !== undefined && <Notice tone="ok">Asignamos la tarea a {assignedCount} {assignedCount === "1" ? "alumno" : "alumnos"}.</Notice>}

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card title={`Alumnos (${tasks.length})`}>
          {tasks.length === 0 ? (
            <p className="text-muted">Todavía no está asignada. Es un borrador.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Alumno</th>
                  <th>Estado</th>
                  <th>Resultado</th>
                  <th>Entrega</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const last = t.attempts[0];
                  return (
                    <tr key={t.id}>
                      <td>
                        {t.assignment.student.lastName}, {t.assignment.student.firstName}
                        <div className="text-xs text-muted">{t.assignment.student.studentProfile?.course.name}</div>
                      </td>
                      <td>
                        <TaskStatusPill status={t.status} />
                        {last?.late && last.submittedAt && (
                          <div className="mt-1">
                            <Pill tone="bad">Fuera de término</Pill>
                          </div>
                        )}
                      </td>
                      <td>
                        {t.status === "COMPLETED" ? (
                          <Link href={`${basePath.replace(/\/tareas$/, "/correccion")}/${t.id}`} className="font-bold">
                            Corregir
                          </Link>
                        ) : last?.result ? (
                          <Pill tone={last.result.passed ? "ok" : "bad"}>
                            {last.result.grade} / 10{t.currentAttempt > 1 ? ` · intento ${t.currentAttempt}` : ""}
                          </Pill>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">{formatDateTime(t.dueAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Consigna">
            <p>{template.instructions}</p>
            <p className="mt-2 text-sm text-muted">
              Al rehacer: {settings.redoScope === "ALL" ? "toda la tarea" : "solo los ítems incorrectos"} · {settings.shuffle ? "opciones mezcladas" : "opciones en orden"}
              {user.role === "ADMIN" && ` · Docente: ${name}`}
            </p>
          </Card>
          {tasks.length > 0 && latestDue && (
            <Card title="Extender plazo">
              <ActionForm action={extendDueAction.bind(null, template.id)}>
                <Field label="Nueva fecha de entrega" hint="Se aplica a todos los alumnos que todavía no entregaron. Las vencidas vuelven a quedar disponibles.">
                  <Input type="datetime-local" name="dueAt" defaultValue={toLocalInput(new Date(Math.max(latestDue.getTime(), Date.now()) + 2 * 86_400_000))} required />
                </Field>
                <SubmitButton variant="secondary">Extender plazo</SubmitButton>
              </ActionForm>
            </Card>
          )}
          <Card title="Más acciones">
            <div className="flex flex-col gap-2">
              <form action={duplicateAction.bind(null, template.id, basePath)}>
                <button type="submit" className="min-h-11 w-full rounded-lg border border-line px-4 text-left font-bold hover:border-muted">
                  Duplicar tarea
                </button>
              </form>
              <form action={bankAction.bind(null, template.id, !template.inBank)}>
                <button type="submit" className="min-h-11 w-full rounded-lg border border-line px-4 text-left font-bold hover:border-muted">
                  {template.inBank ? "Quitar del banco de tareas" : "Guardar en el banco de tareas"}
                </button>
              </form>
              {tasks.length === 0 && (
                <details className="rounded-lg border border-line p-3">
                  <summary className="cursor-pointer font-bold text-bad">Borrar borrador</summary>
                  <ActionForm action={deleteDraftAction.bind(null, template.id, basePath)} className="mt-2 flex flex-col gap-2">
                    <label className="flex gap-2 text-sm">
                      <input type="checkbox" name="confirm" className="mt-1" /> Confirmo que quiero borrar esta tarea. No se puede deshacer.
                    </label>
                    <SubmitButton variant="danger">Borrar</SubmitButton>
                  </ActionForm>
                </details>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

// ---------- Vista previa como alumno ----------

export async function TaskPreviewView({ user, templateId, basePath }: { user: SessionUser; templateId: string; basePath: string }) {
  const template = await loadTemplateFor(user, templateId);
  if (!template) notFound();
  const settings = readSettings(template.settings);
  return (
    <>
      <PageHeader title="Vista previa" subtitle="Así lo ve el alumno, una consigna por pantalla. Acá se muestran todas juntas." back={{ href: `${basePath}/${template.id}`, label: template.title }} />
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-[28px] border-8 border-ink/80 bg-bg p-4">
        <div>
          <Pill tone="ok">{template.subject.name}</Pill>
          <h2 className="mt-2 font-display text-2xl font-bold">{template.title}</h2>
          <p className="text-muted">{template.instructions}</p>
        </div>
        {template.items.map((i, index) => (
          <div key={i.id} className="flex flex-col gap-2 border-t border-line pt-4">
            <span className="text-sm text-muted">
              {index + 1} de {template.items.length}
            </span>
            <StudentItemPreview type={template.type as TaskTypeName} item={{ id: i.id, content: i.content, correct: i.correctAnswer, maxPoints: Number(i.maxPoints), explanation: i.explanation, imageFileId: i.imageFileId }} shuffle={settings.shuffle} seed="vista-previa" />
          </div>
        ))}
        {template.items.length === 0 && <p className="text-muted">Todavía no hay ítems.</p>}
      </div>
    </>
  );
}
