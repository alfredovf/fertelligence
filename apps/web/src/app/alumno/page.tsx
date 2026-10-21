import { prisma } from "@fertelligence/core/db";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Inicio provisorio del alumno: sus materias y docentes. Resolver tareas llega en la etapa 3.
export default async function StudentHome() {
  const user = await requireUser("STUDENT");
  const assignments = await prisma.assignment.findMany({ where: { studentId: user.id, active: true }, include: { subject: true, teacher: true }, orderBy: { subject: { name: "asc" } } });
  return (
    <>
      <PageHeader title={`Hola, ${user.firstName}`} subtitle="Muy pronto vas a ver acá tus tareas." />
      <Card title="Tus materias">
        <ul className="flex flex-col gap-2">
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
              <span className="font-bold">{a.subject.name}</span>
              <span className="text-sm text-muted">Prof. {a.teacher.firstName} {a.teacher.lastName}</span>
            </li>
          ))}
          {assignments.length === 0 && <li className="text-muted">Todavía no tenés materias asignadas. Ya te las va a cargar la escuela.</li>}
        </ul>
      </Card>
    </>
  );
}
