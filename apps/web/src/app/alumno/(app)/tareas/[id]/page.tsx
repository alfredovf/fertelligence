import type { TaskTypeName } from "@fertelligence/core";
import { currentAttempt, isAnswered, isOpen, loadStudentTask } from "@fertelligence/core/services/attempts";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StudentResult } from "@/components/student/result-view";
import { ListenButton } from "@/components/student/speech";
import { Notice, Pill } from "@/components/ui";
import { formatDateTime, formatWeekday } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { estimatedMinutes } from "@/lib/student";
import { startTaskAction } from "../../../actions";

export const dynamic = "force-dynamic";

// "Antes de empezar": qué hay que hacer, cuánto tarda y para cuándo. Baja la ansiedad de arranque.
export default async function BeforeStartPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("STUDENT");
  const { id } = await params;
  const task = await loadStudentTask(user.id, id);
  if (!task) notFound();
  const attempt = currentAttempt(task);
  const type = task.template.type as TaskTypeName;
  const items = task.template.items;
  const answered = attempt && !attempt.submittedAt ? items.filter((i) => attempt.answers.some((a) => a.itemId === i.id && (a.carriedOver || isAnswered(type, i.content, a.response)))).length : 0;
  const open = isOpen(task.status);
  const teacher = task.assignment.teacher;
  const redo = task.status === "REDO" || (task.currentAttempt > 1 && open);

  return (
    <>
      <Link href="/alumno/tareas" className="text-sm text-muted no-underline">
        ‹ Mis tareas
      </Link>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "var(--sunk)", color: task.template.subject.color ?? "var(--ink)" }}>
          {task.template.subject.name}
        </span>
        <Pill>
          Prof. {teacher.firstName} {teacher.lastName}
        </Pill>
      </div>
      <h1 className="font-display text-3xl font-bold">{task.template.title}</h1>
      <p className="font-display text-xl">{task.template.instructions}</p>
      <div>
        <ListenButton text={task.template.instructions} label="Escuchar la consigna" />
      </div>

      {task.status === "OVERDUE" && <Notice tone="bad">Esta tarea venció el {formatWeekday(task.dueAt)}. Todavía podés entregarla: va a quedar como fuera de término.</Notice>}
      {redo && !task.attempts.some((a) => a.result) && <Notice tone="warn">Tu docente te pidió rehacerla. La nota que vale es la de este nuevo intento.</Notice>}
      {task.status === "COMPLETED" && <Notice tone="ok">Ya la entregaste{attempt?.late ? " (fuera de término)" : ""}. Te avisamos cuando esté corregida.</Notice>}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-line bg-paper p-3 text-center">
          <div className="font-display text-2xl font-semibold">{items.length}</div>
          <div className="text-xs text-muted">{items.length === 1 ? "pregunta" : "preguntas"}</div>
        </div>
        <div className="rounded-xl border border-line bg-paper p-3 text-center">
          <div className="font-display text-2xl font-semibold">~{estimatedMinutes(items.length)}′</div>
          <div className="text-xs text-muted">minutos</div>
        </div>
        <div className="rounded-xl border border-line bg-paper p-3 text-center">
          <div className="font-display text-lg leading-8 font-semibold">{formatDateTime(task.dueAt).split(",")[0]}</div>
          <div className="text-xs text-muted">entrega</div>
        </div>
      </div>

      {open && (
        <>
          <p className="text-sm text-muted">Se guarda solo. Podés parar y seguir después.</p>
          <form action={startTaskAction.bind(null, task.id)}>
            <button type="submit" className="min-h-12 w-full rounded-xl bg-accent px-5 text-lg font-bold text-accent-ink">
              {answered > 0 ? `Seguir (${answered} de ${items.length})` : redo ? "Rehacer" : "Empezar"}
            </button>
          </form>
        </>
      )}
      <StudentResult task={task} />
      <Link href={`/tareas/${task.templateId}/imprimir?tarea=${task.id}`} target="_blank" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-paper px-4 font-bold text-ink no-underline">
        Imprimir para la carpeta
      </Link>
    </>
  );
}
