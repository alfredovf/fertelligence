import type { TaskTypeName } from "@fertelligence/core";
import { prisma } from "@fertelligence/core/db";
import { loadTemplateFor, ownerOf } from "@fertelligence/core/services/tasks";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintItem } from "@/components/tasks/task-render";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/dates";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Imprimir tarea · Fertelligence" };

// Versión A4 para la carpeta. ?respuestas=1 incluye la clave y las explicaciones (solo docentes y administración).
// ?tarea=<id> imprime la tarea de un alumno con su nombre y su fecha de entrega.
export default async function PrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ respuestas?: string; tarea?: string; letra?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { respuestas, tarea, letra } = await searchParams;

  let template = user.role === "STUDENT" ? null : await loadTemplateFor(user, id);
  let student: { name: string; course: string; dueAt: Date } | null = null;

  if (tarea) {
    const task = await prisma.task.findUnique({ where: { id: tarea }, include: { assignment: { include: { student: { include: { studentProfile: { include: { course: true } } } } } } } });
    const own = task && user.role === "STUDENT" && task.assignment.studentId === user.id && !["DRAFT", "SCHEDULED"].includes(task.status);
    if (!task || task.templateId !== id || (user.role === "STUDENT" && !own)) notFound();
    if (user.role === "STUDENT") template = await prisma.taskTemplate.findUnique({ where: { id }, include: { items: { orderBy: { position: "asc" } }, subject: true } });
    const s = task.assignment.student;
    student = { name: `${s.firstName} ${s.lastName}`, course: s.studentProfile?.course.name ?? "", dueAt: task.dueAt };
  }
  if (!template) notFound();

  const withAnswers = respuestas === "1" && user.role !== "STUDENT";
  const owner = await prisma.user.findUnique({ where: { id: ownerOf(template) }, select: { firstName: true, lastName: true } });
  const large = letra === "grande";
  const query = (changes: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ ...(respuestas ? { respuestas } : {}), ...(tarea ? { tarea } : {}), ...(letra ? { letra } : {}) });
    for (const [k, v] of Object.entries(changes)) v ? p.set(k, v) : p.delete(k);
    return `?${p.toString()}`;
  };

  return (
    <div className="min-h-dvh bg-sunk print:bg-white">
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-3 px-4 py-4 print:hidden">
        <PrintButton />
        {user.role !== "STUDENT" && (
          <Link href={query({ respuestas: withAnswers ? undefined : "1" })} className="rounded-lg border border-line bg-paper px-3 py-2 text-ink no-underline">
            {withAnswers ? "Sin respuestas" : "Con respuestas"}
          </Link>
        )}
        <Link href={query({ letra: large ? undefined : "grande" })} className="rounded-lg border border-line bg-paper px-3 py-2 text-ink no-underline">
          {large ? "Letra normal" : "Letra grande"}
        </Link>
        <span className="text-sm text-muted">Se imprime siempre en tema claro.</span>
      </div>
      <article className={`mx-auto w-full max-w-[210mm] bg-white px-[16mm] py-[14mm] text-neutral-900 shadow-sm print:max-w-none print:p-0 print:shadow-none ${large ? "text-[17px]" : "text-[14px]"}`} style={{ colorScheme: "light" }}>
        <header className="flex justify-between gap-6 border-b-2 border-neutral-900 pb-3">
          <div>
            <h1 className="font-display text-xl font-bold">{template.title}</h1>
            <p>
              {template.subject.name}
              {owner && ` · Prof. ${owner.firstName} ${owner.lastName}`}
            </p>
          </div>
          <div className="text-right">
            {student ? (
              <>
                <p>
                  {student.name}
                  {student.course && ` · ${student.course}`}
                </p>
                <p>Entrega: {formatDateTime(student.dueAt)}</p>
              </>
            ) : (
              <>
                <p>Nombre: ______________________</p>
                <p>Fecha: ____ / ____ / ______</p>
              </>
            )}
          </div>
        </header>
        <p className="my-3">
          <b>Consigna:</b> {template.instructions}
        </p>
        {withAnswers && <p className="mb-2 rounded border border-neutral-400 px-2 py-1 text-sm">Copia con respuestas: solo para el docente.</p>}
        {template.items.map((item, index) => (
          <PrintItem key={item.id} index={index} withAnswers={withAnswers} type={template.type as TaskTypeName} item={{ id: item.id, content: item.content, correct: item.correctAnswer, maxPoints: Number(item.maxPoints), explanation: item.explanation, imageFileId: item.imageFileId }} />
        ))}
        <footer className="mt-6 text-xs text-neutral-500">Fertelligence · {template.items.reduce((s, i) => s + Number(i.maxPoints), 0)} puntos en total · la nota se calcula sobre 10</footer>
      </article>
    </div>
  );
}
