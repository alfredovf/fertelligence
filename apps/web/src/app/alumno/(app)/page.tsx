import { prisma } from "@fertelligence/core/db";
import { readPreferences, studentProgress } from "@fertelligence/core/services/attempts";
import Link from "next/link";
import { StudentStatus, TaskCard } from "@/components/student/task-card";
import { formatWeekday } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { estimatedMinutes, studentTasks, todayOrder } from "@/lib/student";
import { startTaskAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hoy · Fertelligence" };

// "Hoy": una sola acción principal, la próxima tarea. Abajo, lo que viene después.
export default async function TodayPage() {
  const user = await requireUser("STUDENT");
  const [cards, progress, profile, settings] = await Promise.all([
    studentTasks(user.id),
    studentProgress(user.id),
    prisma.studentProfile.findUnique({ where: { userId: user.id } }),
    prisma.schoolSettings.findUnique({ where: { id: 1 } }),
  ]);
  const pending = todayOrder(cards);
  const [next, ...after] = pending;
  const recentlyCorrected = cards.filter((c) => c.status === "CORRECTED").slice(-2);
  const showStreak = (settings?.achievementsEnabled ?? true) && readPreferences(profile?.preferences).showAchievements && progress.streak > 0;

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-semibold">Hola, {user.firstName}</h1>
        <p className="text-muted">{pending.length === 0 ? "No tenés tareas pendientes. ¡Bien!" : pending.length === 1 ? "Tenés 1 tarea para hacer." : `Tenés ${pending.length} tareas para hacer.`}</p>
      </div>

      {next && (
        <section className="flex flex-col gap-3 rounded-2xl border-2 border-accent bg-paper p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <StudentStatus card={next} />
            <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "var(--sunk)", color: next.subjectColor ?? "var(--ink)" }}>
              {next.subject}
            </span>
          </div>
          <h2 className="font-display text-xl font-semibold">{next.title}</h2>
          <p className="text-sm text-muted">
            {next.items} {next.items === 1 ? "pregunta" : "preguntas"} · unos {estimatedMinutes(next.items)} minutos ·{" "}
            {next.status === "OVERDUE" ? `venció el ${formatWeekday(next.dueAt)}, todavía podés entregarla` : `entregá antes del ${formatWeekday(next.dueAt)}`}
          </p>
          <form action={startTaskAction.bind(null, next.id)}>
            <button type="submit" className="min-h-12 w-full rounded-xl bg-accent px-5 text-lg font-bold text-accent-ink">
              {next.answered > 0 ? "Seguir" : next.redo ? "Rehacer" : "Empezar"}
            </button>
          </form>
        </section>
      )}

      {after.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display font-semibold">Después</h2>
          {after.slice(0, 4).map((c) => (
            <TaskCard key={c.id} card={c} />
          ))}
          {after.length > 4 && <Link href="/alumno/tareas">Ver todas</Link>}
        </section>
      )}

      {recentlyCorrected.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display font-semibold">Corregidas</h2>
          {recentlyCorrected.map((c) => (
            <TaskCard key={c.id} card={c} />
          ))}
        </section>
      )}

      {showStreak && (
        <div className="rounded-xl border border-sun bg-sun-soft p-3">
          <b>
            {progress.streak} {progress.streak === 1 ? "día" : "días seguidos"}
          </b>{" "}
          con tareas entregadas.
        </div>
      )}
    </>
  );
}
