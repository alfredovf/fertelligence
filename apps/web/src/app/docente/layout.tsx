import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/session";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("TEACHER");
  return (
    <AppShell user={user} nav={[{ href: "/docente", label: "Inicio" }, { href: "/docente/tareas", label: "Tareas" }, { href: "/docente/tareas/nueva", label: "Nueva tarea" }]}>
      {children}
    </AppShell>
  );
}
