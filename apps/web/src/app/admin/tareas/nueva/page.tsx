import { prisma } from "@fertelligence/core/db";
import { NewTaskView } from "@/components/tasks/pages";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tarea en nombre de un docente · Fertelligence" };

// Paso previo: elegir el docente. Después es el mismo formulario que usa el docente.
export default async function AdminNewTaskPage({ searchParams }: { searchParams: Promise<{ docente?: string }> }) {
  const user = await requireUser("ADMIN");
  const { docente } = await searchParams;
  const teachers = await prisma.user.findMany({
    where: { role: "TEACHER", status: "ACTIVE" },
    include: { teacherSubjects: { include: { subject: true } } },
    orderBy: { lastName: "asc" },
  });
  const teacher = teachers.find((t) => t.id === docente);
  if (teacher) return <NewTaskView user={user} teacherId={teacher.id} basePath="/admin/tareas" backHref="/admin/tareas" />;

  return (
    <>
      <PageHeader title="Tarea en nombre de un docente" back={{ href: "/admin/tareas", label: "Tareas" }} />
      <Card title="1. Elegí el docente" className="max-w-2xl">
        <ul className="flex flex-col gap-2">
          {teachers.map((t) => (
            <li key={t.id}>
              <a href={`/admin/tareas/nueva?docente=${t.id}`} className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-line px-3 text-ink no-underline hover:border-accent">
                <b>
                  {t.firstName} {t.lastName}
                </b>
                <span className="text-sm text-muted">{t.teacherSubjects.map((s) => s.subject.name).join(", ") || "Sin materias"}</span>
              </a>
            </li>
          ))}
          {teachers.length === 0 && <li className="text-muted">No hay docentes activos.</li>}
        </ul>
        <p className="mt-3 text-sm text-muted">El docente recibe una notificación y la tarea queda registrada con tu usuario.</p>
      </Card>
    </>
  );
}
