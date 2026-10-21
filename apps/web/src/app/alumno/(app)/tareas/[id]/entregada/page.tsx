import { prisma } from "@fertelligence/core/db";
import { loadStudentTask, readPreferences, studentProgress } from "@fertelligence/core/services/attempts";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { studentTasks, todayOrder } from "@/lib/student";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tarea entregada · Fertelligence" };

export default async function DeliveredPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tarde?: string }> }) {
  const user = await requireUser("STUDENT");
  const { id } = await params;
  const { tarde } = await searchParams;
  const task = await loadStudentTask(user.id, id);
  if (!task) notFound();
  const [progress, profile, settings, cards] = await Promise.all([
    studentProgress(user.id),
    prisma.studentProfile.findUnique({ where: { userId: user.id } }),
    prisma.schoolSettings.findUnique({ where: { id: 1 } }),
    studentTasks(user.id),
  ]);
  const next = todayOrder(cards)[0];
  const showStreak = (settings?.achievementsEnabled ?? true) && readPreferences(profile?.preferences).showAchievements && progress.streak > 0;
  const teacher = task.assignment.teacher;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">
      <div className="grid size-24 place-items-center rounded-full bg-ok-soft font-display text-5xl text-ok" aria-hidden="true">
        ✓
      </div>
      <h1 className="font-display text-3xl font-bold">Tarea entregada</h1>
      <p className="max-w-sm text-lg text-muted">
        {tarde ? "La entregaste fuera de término. " : ""}
        Prof. {teacher.firstName} {teacher.lastName} la va a corregir. Te avisamos cuando tengas la nota.
      </p>
      {showStreak && (
        <div className="rounded-xl border border-sun bg-sun-soft px-4 py-2">
          Racha: <b>{progress.streak === 1 ? "1 día" : `${progress.streak} días`}</b>
        </div>
      )}
      <div className="mt-4 flex w-full max-w-sm flex-col gap-3">
        {next && (
          <Link href={`/alumno/tareas/${next.id}`} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-accent px-5 text-lg font-bold text-accent-ink no-underline">
            Siguiente tarea: {next.title}
          </Link>
        )}
        <Link href="/alumno/tareas" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-paper px-5 font-bold text-ink no-underline">
          Ver mis tareas
        </Link>
      </div>
    </div>
  );
}
