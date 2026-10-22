import { PhotoTaskView } from "@/components/tasks/ai-pages";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Crear desde una foto · Fertelligence" };

export default async function Page() {
  const user = await requireUser("TEACHER");
  const teacherId = user.id;
  const back = "/docente/tareas/nueva";
  return <PhotoTaskView user={user} teacherId={teacherId} basePath="/docente/tareas" backHref={back} />;
}
