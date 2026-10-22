import { prisma } from "@fertelligence/core/db";
import { redirect } from "next/navigation";
import { TextTaskView } from "@/components/tasks/ai-pages";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Crear desde un texto · Fertelligence" };

export default async function Page({ searchParams }: { searchParams: Promise<{ docente?: string; fuente?: string }> }) {
  const user = await requireUser("ADMIN");
  const { docente, fuente } = await searchParams;
  const teacher = docente ? await prisma.user.findFirst({ where: { id: docente, role: "TEACHER", status: "ACTIVE" } }) : null;
  if (!teacher) redirect("/admin/tareas/nueva");
  const teacherId = teacher.id;
  const back = `/admin/tareas/nueva?docente=${teacherId}`;
  return <TextTaskView user={user} teacherId={teacherId} basePath="/admin/tareas" backHref={back} sourceId={fuente} />;
}
