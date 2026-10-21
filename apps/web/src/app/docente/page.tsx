import { prisma } from "@fertelligence/core/db";
import { Card, PageHeader, Table } from "@/components/ui";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Inicio provisorio del docente: sus alumnos por materia. Las tareas llegan en la etapa 2.
export default async function TeacherHome() {
  const user = await requireUser("TEACHER");
  const assignments = await prisma.assignment.findMany({
    where: { teacherId: user.id, active: true },
    include: { student: { include: { studentProfile: { include: { course: true } } } }, subject: true },
    orderBy: [{ subject: { name: "asc" } }, { student: { lastName: "asc" } }],
  });
  return (
    <>
      <PageHeader title={`Hola, ${user.firstName}`} subtitle="La creación de tareas llega en la próxima etapa." />
      <Card title={`Mis alumnos (${new Set(assignments.map((a) => a.studentId)).size})`}>
        <Table>
          <thead>
            <tr><th>Alumno</th><th>Curso</th><th>Materia</th></tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id}>
                <td className="font-bold">{a.student.firstName} {a.student.lastName}</td>
                <td>{a.student.studentProfile?.course.name}</td>
                <td>{a.subject.name}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
