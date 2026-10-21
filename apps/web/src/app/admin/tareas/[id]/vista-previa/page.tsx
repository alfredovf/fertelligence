import { TaskPreviewView } from "@/components/tasks/pages";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("ADMIN");
  const { id } = await params;
  return <TaskPreviewView user={user} templateId={id} basePath="/admin/tareas" />;
}
