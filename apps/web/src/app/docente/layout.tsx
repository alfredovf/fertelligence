import { prisma } from "@fertelligence/core/db";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/session";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("TEACHER");
  const toCorrect = await prisma.task.count({ where: { status: "COMPLETED", assignment: { teacherId: user.id } } });
  return (
    <AppShell
      user={user}
      nav={[
        { href: "/docente", label: "Inicio" },
        { href: "/docente/correccion", label: "Para corregir", badge: toCorrect },
        { href: "/docente/tareas", label: "Tareas" },
        { href: "/docente/tareas/nueva", label: "Nueva tarea" },
      ]}
    >
      {children}
    </AppShell>
  );
}
