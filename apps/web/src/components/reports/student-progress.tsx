import { taskTypeLabels } from "@fertelligence/core";
import { studentReport } from "@fertelligence/core/services/reports";
import Link from "next/link";
import { TaskStatusPill } from "@/components/tasks/pages";
import { Card, Pill, Table } from "@/components/ui";
import { formatDate } from "@/lib/dates";

const fmt = (n: number | null, suffix = "") => (n === null ? "—" : `${String(Math.round(n * 10) / 10).replace(".", ",")}${suffix}`);

// Progreso de un alumno: constancia, notas por tipo de tarea e historial. Ayuda a decidir qué reforzar.
export async function StudentProgress({ studentId, teacherId, taskHref }: { studentId: string; teacherId: string | null; taskHref?: (templateOrTaskId: string) => string }) {
  const r = await studentReport(studentId, teacherId);
  const weakest = r.byType.length > 1 ? r.byType[r.byType.length - 1] : null;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Tareas asignadas", value: String(r.assigned) },
          { label: "Entregadas a tiempo", value: fmt(r.onTimePercent, " %") },
          { label: "Promedio (sobre 10)", value: fmt(r.averageGrade) },
          { label: "Tiempo típico por tarea", value: r.medianMinutes === null ? "—" : `${r.medianMinutes} min` },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-line bg-paper p-4">
            <div className="font-display text-2xl font-semibold tabular-nums">{k.value}</div>
            <div className="text-sm text-muted">{k.label}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Card title="Por tipo de tarea">
          {r.byType.length === 0 ? (
            <p className="text-muted">Todavía no hay tareas corregidas.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {r.byType.map((t) => (
                <li key={t.type}>
                  <div className="flex justify-between text-sm">
                    <span>
                      {taskTypeLabels[t.type]} <span className="text-muted">({t.count})</span>
                    </span>
                    <b className={`tabular-nums ${t.average < 7 ? "text-bad" : ""}`}>{fmt(t.average)}</b>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunk">
                    <div className={`h-full rounded-full ${t.average >= 7 ? "bg-ok" : "bg-bad"}`} style={{ width: `${t.average * 10}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {weakest && weakest.average < 7 && <p className="mt-3 text-sm text-muted">{taskTypeLabels[weakest.type]} es el tipo donde más le cuesta.</p>}
        </Card>
        <Card title={`Historial (${r.tasks.length})`}>
          <Table>
            <thead>
              <tr>
                <th>Tarea</th>
                <th>Estado</th>
                <th>Nota</th>
                <th>Entrega</th>
              </tr>
            </thead>
            <tbody>
              {r.tasks.map((t) => (
                <tr key={t.id}>
                  <td>
                    {taskHref ? (
                      <Link href={taskHref(t.id)} className="font-bold">
                        {t.title}
                      </Link>
                    ) : (
                      <b>{t.title}</b>
                    )}
                    <div className="text-xs text-muted">
                      {t.subject} · {taskTypeLabels[t.type]}
                      {t.attempts > 1 && ` · ${t.attempts} intentos`}
                    </div>
                  </td>
                  <td>
                    <TaskStatusPill status={t.status} />
                    {t.late && (
                      <div className="mt-1">
                        <Pill tone="bad">Fuera de término</Pill>
                      </div>
                    )}
                  </td>
                  <td>{t.grade !== null ? <Pill tone={t.passed ? "ok" : "bad"}>{t.grade} / 10</Pill> : <span className="text-muted">—</span>}</td>
                  <td className="whitespace-nowrap">{formatDate(t.dueAt)}</td>
                </tr>
              ))}
              {r.tasks.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted">
                    Todavía no tiene tareas.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
