import { ThemeSync } from "@/components/theme-sync";
import { requireUser } from "@/lib/session";

// Modo foco: sin menú ni avisos mientras el alumno resuelve.
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("STUDENT");
  return (
    <div className="min-h-dvh bg-bg">
      <ThemeSync preference={user.theme} />
      {children}
    </div>
  );
}
