import { prisma } from "@fertelligence/core/db";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("ADMIN");
  const pendingConsents = await prisma.user.count({ where: { role: "STUDENT", status: "PENDING_CONSENT", deletedAt: null } });
  return (
    <AppShell
      user={user}
      nav={[
        { href: "/admin", label: "Inicio" },
        { href: "/admin/alumnos", label: "Alumnos", badge: pendingConsents },
        { href: "/admin/docentes", label: "Docentes" },
        { href: "/admin/materias", label: "Materias" },
        { href: "/admin/cursos", label: "Cursos" },
        { href: "/admin/asignaciones", label: "Asignaciones" },
        { href: "/admin/tareas", label: "Tareas" },
        { href: "/admin/correccion", label: "Para corregir" },
        { href: "/admin/importar", label: "Importar" },
        { href: "/admin/configuracion", label: "Configuración" },
        { href: "/admin/auditoria", label: "Auditoría" },
        { href: "/admin/estado", label: "Estado del sistema" },
      ]}
    >
      {children}
    </AppShell>
  );
}
