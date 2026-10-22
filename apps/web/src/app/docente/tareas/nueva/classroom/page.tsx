import { ClassroomTaskView } from "@/components/classroom/pages";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Crear desde Classroom · Fertelligence" };

export default async function Page({ searchParams }: { searchParams: Promise<{ curso?: string; classroom?: string }> }) {
  const user = await requireUser("TEACHER");
  const { curso, classroom } = await searchParams;
  return <ClassroomTaskView user={user} teacherId={user.id} basePath="/docente/tareas" backHref="/docente/tareas/nueva" courseId={curso} notice={classroom} selfPath="/docente/tareas/nueva/classroom" />;
}
