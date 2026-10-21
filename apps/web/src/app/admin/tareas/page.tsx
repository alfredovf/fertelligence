import { prisma } from "@fertelligence/core/db";
import { TaskListView } from "@/components/tasks/pages";
import { LinkButton, PageHeader, Select } from "@/components/ui";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tareas · Fertelligence" };

export default async function AdminTasksPage({ searchParams }: { searchParams: Promise<{ ver?: string; docente?: string }> }) {
  await requireUser("ADMIN");
  const { ver, docente } = await searchParams;
  const teachers = await prisma.user.findMany({ where: { role: "TEACHER" }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true } });
  const teacherId = teachers.find((t) => t.id === docente)?.id ?? null;
  return (
    <>
      <PageHeader
        title="Tareas"
        subtitle="Las tareas de todos los docentes. Podés cargar una en nombre de un docente."
        actions={
          <LinkButton href={`/admin/tareas/nueva${teacherId ? `?docente=${teacherId}` : ""}`} variant="primary">
            + Tarea en nombre de un docente
          </LinkButton>
        }
      />
      <form className="flex max-w-md gap-2">
        {ver && <input type="hidden" name="ver" value={ver} />}
        <Select name="docente" defaultValue={teacherId ?? ""} aria-label="Docente">
          <option value="">Todos los docentes</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.lastName}, {t.firstName}
            </option>
          ))}
        </Select>
        <button type="submit" className="min-h-11 rounded-lg border border-line bg-paper px-4 font-bold">
          Ver
        </button>
      </form>
      <TaskListView ownerId={teacherId} basePath="/admin/tareas" tab={ver} />
    </>
  );
}
