import Link from "next/link";
import { Pill } from "@/components/ui";
import { formatWeekday } from "@/lib/dates";
import type { StudentTaskCard } from "@/lib/student";

// Estado tal como lo ve el alumno: Nueva, Completada o Corregida (más Vencida y Para rehacer).
export function StudentStatus({ card }: { card: StudentTaskCard }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {["NEW", "IN_PROGRESS", "REDO"].includes(card.status) && <Pill tone="accent">Nueva</Pill>}
      {card.redo && <Pill tone="warn">Para rehacer</Pill>}
      {card.status === "OVERDUE" && <Pill tone="bad">Vencida</Pill>}
      {card.status === "COMPLETED" && <Pill tone="warn">Completada</Pill>}
      {card.status === "CORRECTED" && (
        <>
          <Pill>Corregida</Pill>
          {card.passed !== null && <Pill tone={card.passed ? "ok" : "bad"}>{card.passed ? "Aprobada" : "Desaprobada"}</Pill>}
        </>
      )}
    </div>
  );
}

function detail(card: StudentTaskCard) {
  switch (card.status) {
    case "OVERDUE":
      return `Venció el ${formatWeekday(card.dueAt)} · todavía podés entregarla`;
    case "COMPLETED":
      return card.late ? "Entregada fuera de término · esperando corrección" : "Entregada · esperando corrección";
    case "CORRECTED":
      return card.grade !== null ? `${card.grade} de 10` : "Corregida";
    default:
      return `Entregá antes del ${formatWeekday(card.dueAt)}`;
  }
}

const stripe: Record<string, string> = { OVERDUE: "bg-bad", COMPLETED: "bg-warn", CORRECTED: "bg-ok" };

export function TaskCard({ card }: { card: StudentTaskCard }) {
  const inProgress = card.answered > 0 && card.answered < card.items && ["IN_PROGRESS", "OVERDUE"].includes(card.status);
  return (
    <Link href={`/alumno/tareas/${card.id}`} className="grid grid-cols-[6px_1fr] gap-3 rounded-2xl border border-line bg-paper p-3 text-ink no-underline hover:border-muted">
      <span className={`rounded-full ${card.status === "CORRECTED" && card.passed === false ? "bg-bad" : (stripe[card.status] ?? (card.redo ? "bg-sun" : "bg-accent"))}`} aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="font-display text-base font-semibold">{card.title}</div>
        <div className="text-sm text-muted">
          {card.subject} · {detail(card)}
        </div>
        {inProgress && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="h-1.5 w-28 overflow-hidden rounded-full bg-sunk">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${(card.answered / card.items) * 100}%` }} />
            </span>
            {card.answered} de {card.items}
          </div>
        )}
        <StudentStatus card={card} />
      </div>
    </Link>
  );
}
