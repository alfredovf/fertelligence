import { prisma } from "@fertelligence/core/db";
import { redirect } from "next/navigation";
import { ClassroomTaskView } from "@/components/classroom/pages";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Crear desde Classroom · Fertelligence" };

export default async function Page({ searchParams }: { searchParams: Promise<{ docente?: string; curso?: string; classroom?: string }> }) {
  const user = await requireUser("ADMIN");
  const { docente, curso, classroom } = await searchParams;
  const teacher = docente ? await prisma.user.findFirst({ where: { id: docente, role: "TEACHER", status: "ACTIVE" } }) : null;
  if (!teacher) redirect("/admin/tareas/nueva");
  return <ClassroomTaskView user={user} teacherId={teacher.id} basePath="/admin/tareas" backHref={`/admin/tareas/nueva?docente=${teacher.id}`} courseId={curso} notice={classroom} selfPath={`/admin/tareas/nueva/classroom?docente=${teacher.id}`} />;
}
