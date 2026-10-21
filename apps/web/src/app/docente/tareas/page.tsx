import { TaskListView } from "@/components/tasks/pages";
import { LinkButton, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tareas · Fertelligence" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const user = await requireUser("TEACHER");
  const { ver } = await searchParams;
  return (
    <>
      <PageHeader title="Tareas" actions={<LinkButton href="/docente/tareas/nueva" variant="primary">+ Nueva tarea</LinkButton>} />
      <TaskListView ownerId={user.id} basePath="/docente/tareas" tab={ver} />
    </>
  );
}
