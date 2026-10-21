import type { TaskTypeName } from "@fertelligence/core";
import type { StudentTask } from "@fertelligence/core/services/attempts";
import { ReviewItem } from "@/components/tasks/review-item";
import { formatWeekday } from "@/lib/dates";
import { ListenButton } from "./speech";

// Resultado corregido: nota, mensaje del docente y cada ítem con la respuesta correcta y la explicación.
// Lenguaje directo y respetuoso, también cuando está desaprobada.
export function StudentResult({ task }: { task: StudentTask }) {
  const attempt = task.attempts.find((a) => a.result);
  const result = attempt?.result;
  if (!attempt || !result) return null;
  const type = task.template.type as TaskTypeName;
  const teacher = task.assignment.teacher;
  const items = task.template.items;
  const redoPending = result.redoRequested && attempt.number === task.currentAttempt;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-4">
        <div className="flex items-center gap-3">
          <div className="font-display text-5xl leading-none font-bold tabular-nums">
            {result.grade}
            <span className="text-xl text-muted"> / 10</span>
          </div>
          <span className="flex-1" />
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${result.passed ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>{result.passed ? "Aprobada" : "Desaprobada"}</span>
        </div>
        {attempt.number > 1 && <p className="text-sm text-muted">Nota del intento {attempt.number}. Es la que vale.</p>}
        {result.failedForLate && (
          <p className="rounded-lg border border-bad bg-bad-soft p-3 text-sm">
            Desaprobada por entrega fuera de término. {result.reason}
          </p>
        )}
        {result.comment && (
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-xs font-semibold text-accent">
              {teacher.firstName[0]}
              {teacher.lastName[0]}
            </span>
            <p className="flex-1 rounded-xl bg-sunk p-3">{result.comment}</p>
          </div>
        )}
      </div>

      {redoPending && (
        <div className="rounded-2xl border border-sun bg-sun-soft p-4">
          <b className="font-display">Tu docente te pidió rehacerla</b>
          <p className="mt-1">
            Nueva entrega: <b>{formatWeekday(task.dueAt)}</b>. La nota que vale es la del nuevo intento.
          </p>
        </div>
      )}

      <h2 className="font-display text-lg font-semibold">Pregunta por pregunta</h2>
      {items.map((item) => {
        const answer = attempt.answers.find((a) => a.itemId === item.id);
        const points = Number(answer?.finalPoints ?? 0);
        const max = Number(item.maxPoints);
        const full = points >= max;
        return (
          <article key={item.id} className={`flex flex-col gap-3 rounded-2xl border-l-[6px] bg-paper p-4 ${full ? "border-ok" : points > 0 ? "border-sun" : "border-bad"}`}>
            <div className="flex items-center gap-2 text-sm">
              <b>Pregunta {item.position + 1}</b>
              <span className="flex-1" />
              <span className={full ? "font-bold text-ok" : "font-bold text-warn"}>{full ? "¡Bien!" : "Para repasar"}</span>
              <span className="text-muted tabular-nums">
                {points} / {max}
              </span>
            </div>
            <ReviewItem type={type} audience="student" data={{ content: item.content, correct: item.correctAnswer, response: answer?.response ?? null }} />
            {item.explanation && (
              <div className="flex flex-col gap-2 rounded-xl bg-sunk p-3">
                <p>{item.explanation}</p>
                <div>
                  <ListenButton text={item.explanation} label="Escuchar explicación" />
                </div>
              </div>
            )}
            {answer?.itemComment && <p className="text-sm">Tu docente: {answer.itemComment}</p>}
          </article>
        );
      })}
    </section>
  );
}
