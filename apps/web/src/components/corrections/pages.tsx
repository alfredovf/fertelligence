import { taskTypeLabels, type TaskTypeName } from "@fertelligence/core";
import type { SessionUser } from "@fertelligence/core/auth/session";
import { correctionQueue, loadSubmission, needsReview } from "@fertelligence/core/services/corrections";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ReviewItem } from "@/components/tasks/review-item";
import { EmptyState, Notice, PageHeader, Pill } from "@/components/ui";
import { approveAction, bulkApproveAction } from "@/app/correccion-actions";
import { formatDateTime, toLocalInput } from "@/lib/dates";
import { CorrectionForm, type CorrectionItem } from "./correction-form";

// Bandeja y pantalla de corrección, compartidas por el docente y el administrador (que corrige en nombre del docente).

export async function CorrectionQueueView({ user, teacherId, basePath, approved }: { user: SessionUser; teacherId: string | null; basePath: string; approved?: string }) {
  const queue = await correctionQueue(teacherId);
  return (
    <>
      <PageHeader title={`Para corregir (${queue.length})`} subtitle="Las entregas más antiguas primero. Nada le llega al alumno hasta que apruebes la corrección." />
      {approved && <Notice tone="ok">Aprobamos la corrección. {queue.length === 0 ? "No quedan entregas por corregir." : ""}</Notice>}
      {queue.length === 0 ? (
        <EmptyState>No hay entregas esperando corrección.</EmptyState>
      ) : (
        <ActionForm action={bulkApproveAction}>
          <div className="overflow-x-auto rounded-xl border border-line bg-paper">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="text-xs font-bold tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-3 py-2">
                    <span className="sr-only">Elegir</span>
                  </th>
                  <th className="px-3 py-2">Alumno</th>
                  <th className="px-3 py-2">Tarea</th>
                  {!teacherId && <th className="px-3 py-2">Docente</th>}
                  <th className="px-3 py-2">Entregada</th>
                  <th className="px-3 py-2 text-right">Nota sugerida</th>
                  <th className="px-3 py-2">Necesita</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {queue.map((q) => (
                  <tr key={q.taskId} className="border-t border-line">
                    <td className="px-3 py-2">
                      <input type="checkbox" name="taskIds" value={q.taskId} disabled={q.reviewItems > 0} aria-label={`Elegir entrega de ${q.student.firstName}`} className="size-5" />
                    </td>
                    <td className="px-3 py-2 font-bold">
                      {q.student.lastName}, {q.student.firstName}
                    </td>
                    <td className="px-3 py-2">
                      {q.title}
                      <div className="text-xs text-muted">
                        {taskTypeLabels[q.type]} · {q.subject}
                        {q.attemptNumber > 1 && ` · intento ${q.attemptNumber}`}
                      </div>
                    </td>
                    {!teacherId && (
                      <td className="px-3 py-2">
                        {q.teacher.firstName} {q.teacher.lastName}
                      </td>
                    )}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDateTime(q.submittedAt)}
                      {q.late && (
                        <div>
                          <Pill tone="bad">Fuera de término · {q.lateDays === 1 ? "1 día" : `${q.lateDays} días`}</Pill>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Pill tone={q.suggestedGrade >= 7 ? "ok" : "bad"}>{q.suggestedGrade} / 10</Pill>
                    </td>
                    <td className="px-3 py-2">{q.reviewItems > 0 ? <b>{q.reviewItems === 1 ? "1 justificación" : `${q.reviewItems} justificaciones`}</b> : <span className="text-muted">Solo aprobar</span>}</td>
                    <td className="px-3 py-2">
                      <Link href={`${basePath}/${q.taskId}`} className="inline-flex min-h-10 items-center rounded-lg border border-line px-3 font-bold no-underline">
                        {q.reviewItems > 0 ? "Corregir" : "Abrir"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton variant="secondary" pendingLabel="Aprobando…">
              Aprobar las elegidas con la nota sugerida
            </SubmitButton>
            <span className="text-sm text-muted">Solo se pueden aprobar en lote las que no tienen justificaciones para revisar. Pasan a Corregida y el alumno recibe la nota.</span>
          </div>
          {user.role === "ADMIN" && <p className="text-sm text-muted">Las correcciones que apruebes quedan registradas con tu usuario, en nombre del docente.</p>}
        </ActionForm>
      )}
    </>
  );
}

export async function CorrectionView({ user, taskId, basePath, approved }: { user: SessionUser; taskId: string; basePath: string; approved?: string }) {
  const submission = await loadSubmission(user, taskId);
  if (!submission) notFound();
  const { task, attempt } = submission;
  const type = task.template.type as TaskTypeName;
  const student = task.assignment.student;
  const teacher = task.assignment.teacher;

  if (task.status !== "COMPLETED" || !attempt?.submittedAt) {
    return (
      <>
        <PageHeader title={task.template.title} subtitle={`${student.firstName} ${student.lastName}`} back={{ href: basePath, label: "Para corregir" }} />
        <Notice>{attempt?.result ? `Esta entrega ya fue corregida: ${attempt.result.grade} / 10, ${attempt.result.passed ? "aprobada" : "desaprobada"}.` : "Esta tarea todavía no fue entregada."}</Notice>
      </>
    );
  }

  const items: CorrectionItem[] = task.template.items.map((i) => {
    const a = attempt.answers.find((x) => x.itemId === i.id);
    return { id: i.id, index: i.position, maxPoints: Number(i.maxPoints), autoPoints: Number(a?.carriedOver ? (a.finalPoints ?? i.maxPoints) : (a?.autoPoints ?? 0)), carriedOver: Boolean(a?.carriedOver), needsReview: needsReview(type, i.content) };
  });
  const renders = task.template.items.map((i) => (
    <ReviewItem key={i.id} type={type} audience="teacher" data={{ content: i.content, correct: i.correctAnswer, response: attempt.answers.find((x) => x.itemId === i.id)?.response ?? null }} />
  ));

  return (
    <>
      <PageHeader
        title={`${task.template.title} · ${taskTypeLabels[type]}`}
        subtitle={
          <>
            {student.firstName} {student.lastName} · entregada el {formatDateTime(attempt.submittedAt)}
            {attempt.number > 1 && ` · intento ${attempt.number}`}
            {user.role === "ADMIN" && ` · Docente: ${teacher.firstName} ${teacher.lastName}`}
          </>
        }
        back={{ href: basePath, label: "Para corregir" }}
      />
      {approved && <Notice tone="ok">Aprobamos la corrección anterior. Esta es la siguiente entrega de la bandeja.</Notice>}
      {user.role === "ADMIN" && (
        <Notice tone="warn">
          Estás corrigiendo en nombre de {teacher.firstName} {teacher.lastName}. Queda registrado con tu usuario.
        </Notice>
      )}
      <CorrectionForm
        items={items}
        renders={renders}
        passGrade={task.passGrade}
        late={attempt.late}
        lateDays={attempt.lateDays}
        defaultRedoDue={toLocalInput(new Date(Date.now() + 4 * 86_400_000)).slice(0, 10) + "T23:59"}
        approve={approveAction.bind(null, task.id, basePath)}
      />
    </>
  );
}
