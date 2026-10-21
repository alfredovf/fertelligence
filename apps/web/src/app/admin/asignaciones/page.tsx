import { prisma } from "@fertelligence/core/db";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState, PageHeader, Select } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { saveAssignmentsAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Asignaciones · Fertelligence" };

// Matriz por curso: filas alumnos, columnas materias, en cada celda el docente.
export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<{ curso?: string }> }) {
  await requireUser("ADMIN");
  const { curso } = await searchParams;
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 1 } });
  const cycleId = settings?.activeCycleId ?? undefined;
  const courses = await prisma.course.findMany({ where: { cycleId }, orderBy: { name: "asc" } });
  const course = courses.find((c) => c.id === curso) ?? courses[0];

  if (!course) {
    return (
      <>
        <PageHeader title="Asignaciones" />
        <EmptyState>
          Primero creá un curso en <Link href="/admin/cursos">Cursos</Link>.
        </EmptyState>
      </>
    );
  }

  const [students, subjects, teacherSubjects, assignments] = await Promise.all([
    prisma.user.findMany({ where: { role: "STUDENT", status: { not: "DISABLED" }, studentProfile: { courseId: course.id } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.subject.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.teacherSubject.findMany({ where: { teacher: { status: { not: "DISABLED" } } }, include: { teacher: true } }),
    prisma.assignment.findMany({ where: { cycleId, active: true, student: { studentProfile: { courseId: course.id } } } }),
  ]);
  const current = new Map(assignments.map((a) => [`${a.studentId}:${a.subjectId}`, a.teacherId]));
  const teachersFor = (subjectId: string) =>
    teacherSubjects
      .filter((t) => t.subjectId === subjectId)
      .map((t) => t.teacher)
      .sort((a, b) => a.lastName.localeCompare(b.lastName));

  return (
    <>
      <PageHeader title="Asignaciones" subtitle="Qué docente tiene cada alumno en cada materia." />
      <nav aria-label="Cursos" className="flex flex-wrap gap-2">
        {courses.map((c) => (
          <Link
            key={c.id}
            href={`/admin/asignaciones?curso=${c.id}`}
            className={`rounded-full border px-3 py-1 text-sm no-underline ${c.id === course.id ? "border-accent bg-accent-soft font-bold text-accent" : "border-line text-ink"}`}
          >
            {c.name}
          </Link>
        ))}
      </nav>
      {students.length === 0 ? (
        <EmptyState>{course.name} todavía no tiene alumnos.</EmptyState>
      ) : (
        <ActionForm action={saveAssignmentsAction}>
          <div className="overflow-x-auto rounded-xl border border-line bg-paper">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs font-bold tracking-wide text-muted uppercase">
                  <th className="sticky left-0 bg-paper px-3 py-2">Alumno</th>
                  {subjects.map((s) => (
                    <th key={s.id} className="px-3 py-2 whitespace-nowrap">
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((st) => (
                  <tr key={st.id} className="border-t border-line">
                    <td className="sticky left-0 bg-paper px-3 py-2 font-bold whitespace-nowrap">
                      <Link href={`/admin/alumnos/${st.id}`} className="text-ink">
                        {st.lastName}, {st.firstName}
                      </Link>
                    </td>
                    {subjects.map((s) => {
                      const key = `${st.id}:${s.id}`;
                      const value = current.get(key) ?? "";
                      const options = teachersFor(s.id);
                      return (
                        <td key={s.id} className="px-2 py-1.5">
                          <input type="hidden" name={`o:${key}`} value={value} />
                          <Select name={`a:${key}`} defaultValue={value} aria-label={`${s.name} de ${st.firstName} ${st.lastName}`} className="min-w-40 text-sm">
                            <option value="">{options.length ? "Sin docente" : "Nadie dicta esta materia"}</option>
                            {options.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.firstName} {t.lastName}
                              </option>
                            ))}
                          </Select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton>Guardar cambios</SubmitButton>
            <span className="text-sm text-muted">Solo aparecen los docentes que dictan cada materia. Se cambia en la ficha del docente.</span>
          </div>
        </ActionForm>
      )}
    </>
  );
}
