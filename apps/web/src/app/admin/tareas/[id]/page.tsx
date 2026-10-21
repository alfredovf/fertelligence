import { TaskDetailView } from "@/components/tasks/pages";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ asignada?: string }> }) {
  const user = await requireUser("ADMIN");
  const { id } = await params;
  const { asignada } = await searchParams;
  return <TaskDetailView user={user} templateId={id} basePath="/admin/tareas" assignedCount={asignada} />;
}
