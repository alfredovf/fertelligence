import { prisma } from "@fertelligence/core/db";
import { notFound } from "next/navigation";
import { StudentProgress } from "@/components/reports/student-progress";
import { LinkButton, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function StudentProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("TEACHER");
  const { id } = await params;
  // Solo alumnos asignados a este docente
  const assignment = await prisma.assignment.findFirst({ where: { studentId: id, teacherId: user.id, active: true }, include: { student: { include: { studentProfile: { include: { course: true } } } } } });
  if (!assignment) notFound();
  const s = assignment.student;
  return (
    <>
      <PageHeader
        title={`${s.firstName} ${s.lastName}`}
        subtitle={`${s.studentProfile?.course.name ?? ""} · solo tus materias`}
        back={{ href: "/docente/alumnos", label: "Mis alumnos" }}
        actions={<LinkButton href="/docente/tareas/nueva" variant="primary">+ Tarea</LinkButton>}
      />
      <StudentProgress studentId={id} teacherId={user.id} />
    </>
  );
}
