import type { TaskTypeName } from "@fertelligence/core";
import { prisma } from "@fertelligence/core/db";
import { currentAttempt, loadStudentTask, readPreferences } from "@fertelligence/core/services/attempts";
import { readSettings } from "@fertelligence/core/services/tasks";
import { notFound, redirect } from "next/navigation";
import { TaskRunner, type RunnerItem } from "@/components/student/task-runner";
import { requireUser } from "@/lib/session";
import { saveAnswerAction, submitTaskAction } from "../../../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resolver · Fertelligence" };

export default async function SolvePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("STUDENT");
  const { id } = await params;
  const task = await loadStudentTask(user.id, id);
  if (!task) notFound();
  const attempt = currentAttempt(task);
  if (!attempt || attempt.submittedAt) redirect(`/alumno/tareas/${id}`);

  const profile = await prisma.studentProfile.findUnique({ where: { userId: user.id } });
  const prefs = readPreferences(profile?.preferences);
  const settings = readSettings(task.template.settings);

  // Al navegador va solo el contenido: nunca la clave de corrección ni las explicaciones.
  const items: RunnerItem[] = task.template.items.map((i) => {
    const answer = attempt.answers.find((a) => a.itemId === i.id);
    return { id: i.id, content: i.content as Record<string, unknown>, imageFileId: i.imageFileId, carriedOver: Boolean(answer?.carriedOver), response: answer?.response ?? null };
  });

  return (
    <TaskRunner
      taskId={task.id}
      title={task.template.title}
      instructions={task.template.instructions}
      type={task.template.type as TaskTypeName}
      items={items}
      seed={`${task.id}:${attempt.number}`}
      shuffle={settings.shuffle}
      overdue={task.dueAt.getTime() < Date.now()}
      prefs={{ fontSize: prefs.fontSize, autoRead: prefs.autoRead, pauseReminders: prefs.pauseReminders, showTimer: prefs.showTimer, reduceMotion: prefs.reduceMotion }}
      save={saveAnswerAction}
      submit={submitTaskAction}
    />
  );
}
