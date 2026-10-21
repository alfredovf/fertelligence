import type { SessionUser } from "@fertelligence/core/auth/session";
import Link from "next/link";
import { StudentTabs } from "./student-tabs";
import { ThemeSync } from "./theme-sync";

// Armazón del alumno: pensado primero para el celular, con el menú abajo al alcance del pulgar.
export function StudentShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <ThemeSync preference={user.theme} />
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
          <Link href="/alumno" className="font-display text-lg font-bold tracking-tight text-ink no-underline">
            Fert<span className="text-accent">elligence</span>
          </Link>
          <div className="hidden flex-1 md:block">
            <StudentTabs variant="top" />
          </div>
          <span className="flex-1 md:hidden" />
          <Link href="/perfil" aria-label="Mi perfil y preferencias" className="grid size-9 place-items-center rounded-full bg-accent-soft font-display text-xs font-semibold text-accent no-underline">
            {initials}
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pt-5 pb-28 md:pb-10">{children}</main>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <StudentTabs variant="bottom" />
      </div>
    </div>
  );
}
