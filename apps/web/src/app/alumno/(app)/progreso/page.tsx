import { prisma } from "@fertelligence/core/db";
import { readPreferences, studentProgress } from "@fertelligence/core/services/attempts";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { studentTasks } from "@/lib/student";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi progreso · Fertelligence" };

// Progreso centrado en la constancia. Las notas por materia aparecen cuando haya tareas corregidas.
export default async function ProgressPage() {
  const user = await requireUser("STUDENT");
  const [progress, cards, profile, settings] = await Promise.all([
    studentProgress(user.id),
    studentTasks(user.id),
    prisma.studentProfile.findUnique({ where: { userId: user.id } }),
    prisma.schoolSettings.findUnique({ where: { id: 1 } }),
  ]);
  const showAchievements = (settings?.achievementsEnabled ?? true) && readPreferences(profile?.preferences).showAchievements;
  const corrected = cards.filter((c) => c.status === "CORRECTED" && c.grade !== null);
  const bySubject = [...new Set(corrected.map((c) => c.subject))].map((subject) => {
    const grades = corrected.filter((c) => c.subject === subject).map((c) => c.grade!);
    return { subject, average: grades.reduce((a, b) => a + b, 0) / grades.length };
  });
  const pending = cards.filter((c) => ["NEW", "IN_PROGRESS", "OVERDUE", "REDO"].includes(c.status)).length;

  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Mi progreso</h1>
      <div className="grid grid-cols-2 gap-3">
        {showAchievements && (
          <div className="rounded-xl border border-sun bg-sun-soft p-4">
            <div className="text-sm text-muted">Racha</div>
            <div className="font-display text-3xl font-bold">{progress.streak === 1 ? "1 día" : `${progress.streak} días`}</div>
          </div>
        )}
        <div className="rounded-xl border border-line bg-paper p-4">
          <div className="text-sm text-muted">Entregadas a tiempo</div>
          <div className="font-display text-3xl font-bold">{progress.onTimePercent === null ? "—" : `${progress.onTimePercent} %`}</div>
        </div>
        <div className="rounded-xl border border-line bg-paper p-4">
          <div className="text-sm text-muted">Entregadas este mes</div>
          <div className="font-display text-3xl font-bold">{progress.submittedThisMonth}</div>
        </div>
        <div className="rounded-xl border border-line bg-paper p-4">
          <div className="text-sm text-muted">Pendientes</div>
          <div className="font-display text-3xl font-bold">{pending}</div>
        </div>
      </div>
      <Card title="Promedio por materia">
        {bySubject.length === 0 ? (
          <p className="text-muted">Cuando tus docentes corrijan tus tareas, vas a ver acá tu promedio en cada materia.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {bySubject.map((s) => (
              <li key={s.subject}>
                <div className="flex justify-between">
                  <span>{s.subject}</span>
                  <b className="tabular-nums">{s.average.toFixed(1).replace(".", ",")}</b>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunk">
                  <div className={`h-full rounded-full ${s.average >= 7 ? "bg-ok" : "bg-bad"}`} style={{ width: `${s.average * 10}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
