import { taskTypeLabels } from "@fertelligence/core";
import { prisma } from "@fertelligence/core/db";
import { schoolReport } from "@fertelligence/core/services/reports";
import { Card, EmptyState, Input, PageHeader, Select, Table } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { parseReportFilters } from "./filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reportes · Fertelligence" };

const fmt = (n: number | null, suffix = "") => (n === null ? "—" : `${String(n).replace(".", ",")}${suffix}`);

function Bar({ value, tone = "ok" }: { value: number | null; tone?: "ok" | "accent" }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-sunk">
      <div className={`h-full rounded-full ${tone === "ok" ? "bg-ok" : "bg-accent"}`} style={{ width: `${value ?? 0}%` }} />
    </div>
  );
}

// Gráfico de barras por semana: asignadas (claro) y aprobadas (oscuro). Escala única para las dos series.
function WeeklyChart({ weeks }: { weeks: { week: string; assigned: number; passed: number }[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.assigned));
  const h = 160;
  const barW = Math.max(8, Math.min(28, Math.floor(520 / Math.max(1, weeks.length) / 2.4)));
  const step = barW * 2.4;
  const width = Math.max(320, weeks.length * step + 40);
  const ticks = [0, Math.ceil(max / 2), max];
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${h + 36}`} width="100%" style={{ minWidth: Math.min(width, 600) }} role="img" aria-label="Tareas asignadas y aprobadas por semana">
        {ticks.map((t) => {
          const y = 8 + h - (t / max) * h;
          return (
            <g key={t}>
              <line x1="30" x2={width} y1={y} y2={y} stroke="var(--line)" strokeDasharray={t ? "3 4" : undefined} />
              <text x="24" y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted)">
                {t}
              </text>
            </g>
          );
        })}
        {weeks.map((w, i) => {
          const x = 36 + i * step;
          const ha = (w.assigned / max) * h;
          const hp = (w.passed / max) * h;
          return (
            <g key={w.week}>
              <title>{`Semana del ${w.week.slice(8, 10)}/${w.week.slice(5, 7)}: ${w.assigned} asignadas, ${w.passed} aprobadas`}</title>
              <rect x={x} y={8 + h - ha} width={barW} height={ha} rx="2" fill="var(--accent-soft)" />
              <rect x={x + barW} y={8 + h - hp} width={barW} height={hp} rx="2" fill="var(--accent)" />
              <text x={x + barW} y={h + 26} textAnchor="middle" fontSize="10" fill="var(--muted)">
                {`${w.week.slice(8, 10)}/${w.week.slice(5, 7)}`}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-accent-soft" /> Asignadas
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-accent" /> Aprobadas
        </span>
      </div>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; curso?: string }> }) {
  await requireUser("ADMIN");
  const params = await searchParams;
  const { desde, hasta, curso, filter } = parseReportFilters(params);
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 1 } });
  const [courses, report] = await Promise.all([prisma.course.findMany({ where: { cycleId: settings?.activeCycleId ?? undefined }, orderBy: { name: "asc" } }), schoolReport(filter)]);
  const qs = new URLSearchParams({ desde, hasta, ...(curso ? { curso } : {}) }).toString();
  const exportLink = (tabla: string, label: string) => (
    <a href={`/admin/reportes/exportar?tabla=${tabla}&${qs}`} className="text-sm">
      {label}
    </a>
  );

  return (
    <>
      <PageHeader title="Reportes" subtitle="Tareas con fecha de entrega en el período elegido." />
      <form className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-bold text-muted">Desde</span>
          <Input type="date" name="desde" defaultValue={desde} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-bold text-muted">Hasta</span>
          <Input type="date" name="hasta" defaultValue={hasta} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-bold text-muted">Curso</span>
          <Select name="curso" defaultValue={curso ?? ""}>
            <option value="">Todos</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <button type="submit" className="min-h-11 rounded-lg border border-line bg-paper px-4 font-bold">
          Ver
        </button>
      </form>

      {report.totals.assigned === 0 ? (
        <EmptyState>No hay tareas con entrega en ese período.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Tareas asignadas", value: fmt(report.totals.assigned) },
              { label: "Entregadas a tiempo", value: fmt(report.totals.onTimePercent, " %") },
              { label: "Aprobadas (de las corregidas)", value: fmt(report.totals.approvalPercent, " %") },
              { label: "Nota promedio", value: fmt(report.totals.averageGrade) },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-line bg-paper p-4">
                <div className="font-display text-2xl font-semibold tabular-nums">{k.value}</div>
                <div className="text-sm text-muted">{k.label}</div>
              </div>
            ))}
          </div>

          <Card title="Por semana" actions={exportLink("semanas", "Exportar CSV")}>
            <WeeklyChart weeks={report.byWeek} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card title="Por materia" actions={exportLink("materias", "Exportar CSV")}>
              <Table>
                <thead>
                  <tr>
                    <th>Materia</th>
                    <th className="text-right">Asignadas</th>
                    <th className="w-32">A tiempo</th>
                    <th className="w-32">Aprobadas</th>
                    <th className="text-right">Promedio</th>
                  </tr>
                </thead>
                <tbody>
                  {report.bySubject.map((r) => (
                    <tr key={r.name}>
                      <td className="font-bold">{r.name}</td>
                      <td className="text-right">{r.assigned}</td>
                      <td>
                        <div className="text-xs">{fmt(r.onTimePercent, " %")}</div>
                        <Bar value={r.onTimePercent} tone="accent" />
                      </td>
                      <td>
                        <div className="text-xs">{fmt(r.approvalPercent, " %")}</div>
                        <Bar value={r.approvalPercent} />
                      </td>
                      <td className="text-right">{fmt(r.averageGrade)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
            <Card title="Aprobación por tipo de tarea" actions={exportLink("tipos", "Exportar CSV")}>
              <ul className="flex flex-col gap-3">
                {[...report.byType]
                  .sort((a, b) => (b.approvalPercent ?? -1) - (a.approvalPercent ?? -1))
                  .map((r) => (
                    <li key={r.type}>
                      <div className="flex justify-between text-sm">
                        <span>{taskTypeLabels[r.type]}</span>
                        <b className="tabular-nums">{fmt(r.approvalPercent, " %")}</b>
                      </div>
                      <Bar value={r.approvalPercent} />
                    </li>
                  ))}
              </ul>
            </Card>
          </div>

          <Card title="Por docente" actions={exportLink("docentes", "Exportar CSV")}>
            <Table>
              <thead>
                <tr>
                  <th>Docente</th>
                  <th className="text-right">Asignadas</th>
                  <th className="text-right">Sin corregir</th>
                  <th className="text-right">Días para corregir (promedio)</th>
                  <th className="text-right">Aprobadas</th>
                </tr>
              </thead>
              <tbody>
                {report.byTeacher.map((r) => (
                  <tr key={r.name}>
                    <td className="font-bold">{r.name}</td>
                    <td className="text-right">{r.assigned}</td>
                    <td className="text-right">{r.pending}</td>
                    <td className="text-right">{fmt(r.avgCorrectionDays)}</td>
                    <td className="text-right">{fmt(r.approvalPercent, " %")}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
