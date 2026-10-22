import { AiJobView } from "@/components/tasks/ai-pages";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Creando la tarea · Fertelligence" };

export default async function Page({ params }: { params: Promise<{ jobId: string }> }) {
  const user = await requireUser("ADMIN");
  const { jobId } = await params;
  return <AiJobView user={user} jobId={jobId} basePath="/admin/tareas" backHref="/admin/tareas/nueva" />;
}
