import { prisma } from "@fertelligence/core/db";
import { notFound } from "next/navigation";
import { StudentProgress } from "@/components/reports/student-progress";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminStudentProgressPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("ADMIN");
  const { id } = await params;
  const s = await prisma.user.findFirst({ where: { id, role: "STUDENT" } });
  if (!s) notFound();
  return (
    <>
      <PageHeader title={`Progreso de ${s.firstName} ${s.lastName}`} subtitle="Todas las materias" back={{ href: `/admin/alumnos/${id}`, label: "Ficha del alumno" }} />
      <StudentProgress studentId={id} teacherId={null} />
    </>
  );
}
