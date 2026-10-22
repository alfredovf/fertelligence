import { TaskItemsView } from "@/components/tasks/pages";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ia?: string }> }) {
  const user = await requireUser("ADMIN");
  const { id } = await params;
  const { ia } = await searchParams;
  return <TaskItemsView user={user} templateId={id} basePath="/admin/tareas" aiJobId={ia} />;
}
