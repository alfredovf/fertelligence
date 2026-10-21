import "server-only";
import type { TaskStatus } from "@prisma/client";
import type { TaskTypeName } from "@fertelligence/core";
import { prisma } from "@fertelligence/core/db";
import { isAnswered } from "@fertelligence/core/services/attempts";

// Tareas del alumno con lo necesario para las tarjetas: estado visible, avance y resultado.

export type StudentTaskCard = {
  id: string;
  templateId: string;
  title: string;
  subject: string;
  subjectColor: string | null;
  type: TaskTypeName;
  status: TaskStatus;
  dueAt: Date;
  items: number;
  answered: number;
  redo: boolean;
  late: boolean;
  grade: number | null;
  passed: boolean | null;
};

export async function studentTasks(studentId: string): Promise<StudentTaskCard[]> {
  const tasks = await prisma.task.findMany({
    where: { assignment: { studentId }, status: { notIn: ["DRAFT", "SCHEDULED"] } },
    include: {
      template: { include: { subject: true, items: { select: { id: true, content: true } } } },
      attempts: { orderBy: { number: "desc" }, take: 1, include: { answers: { select: { itemId: true, response: true, carriedOver: true } }, result: true } },
    },
    orderBy: { dueAt: "asc" },
  });
  return tasks.map((t) => {
    const attempt = t.attempts[0];
    const type = t.template.type as TaskTypeName;
    const answered = attempt
      ? t.template.items.filter((i) => {
          const a = attempt.answers.find((x) => x.itemId === i.id);
          return a && (a.carriedOver || isAnswered(type, i.content, a.response));
        }).length
      : 0;
    return {
      id: t.id,
      templateId: t.templateId,
      title: t.template.title,
      subject: t.template.subject.name,
      subjectColor: t.template.subject.color,
      type,
      status: t.status,
      dueAt: t.dueAt,
      items: t.template.items.length,
      answered: attempt?.submittedAt ? t.template.items.length : answered,
      redo: t.status === "REDO" || (t.currentAttempt > 1 && ["IN_PROGRESS", "OVERDUE"].includes(t.status)),
      late: Boolean(attempt?.late),
      grade: attempt?.result?.grade ?? null,
      passed: attempt?.result?.passed ?? null,
    };
  });
}

// Orden de "Hoy": primero lo que hay que rehacer, después lo vencido, después lo nuevo por fecha de entrega.
export function todayOrder(cards: StudentTaskCard[]) {
  const rank = (c: StudentTaskCard) => (c.redo ? 0 : c.status === "OVERDUE" ? 1 : c.status === "IN_PROGRESS" ? 2 : 3);
  return cards.filter((c) => ["NEW", "IN_PROGRESS", "OVERDUE", "REDO"].includes(c.status)).sort((a, b) => rank(a) - rank(b) || a.dueAt.getTime() - b.dueAt.getTime());
}

export function estimatedMinutes(items: number) {
  return Math.max(3, Math.round(items * 1.5));
}
