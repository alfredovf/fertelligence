import { NewTaskView } from "@/components/tasks/pages";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nueva tarea · Fertelligence" };

export default async function Page() {
  const user = await requireUser("TEACHER");
  return <NewTaskView user={user} teacherId={user.id} basePath="/docente/tareas" backHref="/docente/tareas" />;
}
