import { prisma } from "@fertelligence/core/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Table } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { saveCourseAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cursos · Fertelligence" };

export default async function CoursesPage() {
  await requireUser("ADMIN");
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 1 }, include: { activeCycle: true } });
  const courses = await prisma.course.findMany({
    where: { cycleId: settings?.activeCycleId ?? undefined },
    include: { _count: { select: { students: true } } },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageHeader title="Cursos" subtitle={`Ciclo lectivo ${settings?.activeCycle?.year ?? ""}`} />
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Table>
          <thead>
            <tr>
              <th>Curso</th>
              <th className="text-right">Alumnos</th>
              <th>Renombrar</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id}>
                <td className="font-bold">{c.name}</td>
                <td className="text-right">{c._count.students}</td>
                <td>
                  <ActionForm action={saveCourseAction.bind(null, c.id)} className="flex items-center gap-2">
                    <Input name="name" defaultValue={c.name} aria-label={`Nuevo nombre para ${c.name}`} className="max-w-36" required maxLength={40} />
                    <SubmitButton variant="secondary">Guardar</SubmitButton>
                  </ActionForm>
                </td>
              </tr>
            ))}
            {courses.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-muted">
                  Todavía no hay cursos en este ciclo.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
        <Card title="Nuevo curso">
          <ActionForm action={saveCourseAction.bind(null, null)}>
            <Field label="Nombre" hint="Por ejemplo, 4° B o Grupo de apoyo.">
              <Input name="name" required maxLength={40} />
            </Field>
            <SubmitButton>Crear curso</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
