import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/session";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("STUDENT");
  return (
    <AppShell user={user} nav={[{ href: "/alumno", label: "Hoy" }]}>
      {children}
    </AppShell>
  );
}
