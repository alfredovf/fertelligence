import { prisma } from "@fertelligence/core/db";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Notice, PageHeader, Table } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { resendInvitationAction, setPersonActiveAction, updatePersonAction } from "../../actions";
import { PersonFields, StatusPill } from "../../person-form";

export const dynamic = "force-dynamic";

export default async function TeacherPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ creado?: string }> }) {
  await requireUser("ADMIN");
  const { id } = await params;
  const { creado } = await searchParams;
  const teacher = await prisma.user.findFirst({
    where: { id, role: "TEACHER" },
    include: {
      teacherSubjects: true,
      teacherAssignments: { where: { active: true }, include: { subject: true, student: { include: { studentProfile: { include: { course: true } } } } }, orderBy: { subject: { name: "asc" } } },
    },
  });
  if (!teacher) notFound();
  const subjects = await prisma.subject.findMany({ where: { OR: [{ archivedAt: null }, { id: { in: teacher.teacherSubjects.map((t) => t.subjectId) } }] }, orderBy: { name: "asc" } });
  const disabled = teacher.status === "DISABLED";

  return (
    <>
      <PageHeader title={`${teacher.firstName} ${teacher.lastName}`} subtitle={<StatusPill status={teacher.status} />} back={{ href: "/admin/docentes", label: "Docentes" }} />
      {creado && <Notice tone="ok">Creamos la cuenta y le enviamos el email de bienvenida.</Notice>}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card title="Datos">
          <ActionForm action={updatePersonAction.bind(null, teacher.id)}>
            <PersonFields role="TEACHER" person={teacher} subjects={subjects} />
            <SubmitButton>Guardar cambios</SubmitButton>
          </ActionForm>
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Acceso">
            <div className="flex flex-col gap-3">
              <ActionForm action={resendInvitationAction.bind(null, teacher.id)}>
                <SubmitButton variant="secondary" pendingLabel="Enviando…">
                  Reenviar email de bienvenida
                </SubmitButton>
              </ActionForm>
              <ActionForm action={setPersonActiveAction.bind(null, teacher.id, disabled)}>
                <SubmitButton variant={disabled ? "secondary" : "danger"}>{disabled ? "Reactivar cuenta" : "Desactivar cuenta"}</SubmitButton>
              </ActionForm>
            </div>
          </Card>
          <Card title={`Alumnos asignados (${teacher.teacherAssignments.length})`}>
            <Table>
              <thead>
                <tr>
                  <th>Alumno</th>
                  <th>Curso</th>
                  <th>Materia</th>
                </tr>
              </thead>
              <tbody>
                {teacher.teacherAssignments.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.student.firstName} {a.student.lastName}
                    </td>
                    <td>{a.student.studentProfile?.course.name}</td>
                    <td>{a.subject.name}</td>
                  </tr>
                ))}
                {teacher.teacherAssignments.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-muted">
                      Sin alumnos asignados. Se asignan en Asignaciones.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
        </div>
      </div>
    </>
  );
}
