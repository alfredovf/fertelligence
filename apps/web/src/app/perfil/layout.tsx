import { homeForRole } from "@fertelligence/core/auth/session";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/session";

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell user={user} nav={[{ href: homeForRole[user.role], label: "Volver al inicio" }]}>
      {children}
    </AppShell>
  );
}
