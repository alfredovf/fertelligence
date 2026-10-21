import { homeForRole } from "@fertelligence/core/auth/session";
import { AppShell } from "@/components/app-shell";
import { StudentShell } from "@/components/student-shell";
import { requireUser } from "@/lib/session";

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role === "STUDENT") return <StudentShell user={user}>{children}</StudentShell>;
  return (
    <AppShell user={user} nav={[{ href: homeForRole[user.role], label: "Volver al inicio" }]}>
      {children}
    </AppShell>
  );
}
