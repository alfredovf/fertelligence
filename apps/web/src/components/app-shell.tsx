import type { SessionUser } from "@fertelligence/core/auth/session";
import Link from "next/link";
import { logoutAction } from "@/app/(public)/actions";
import { NavLinks, type NavItem } from "./nav-links";
import { NotificationBell } from "./notification-bell";
import { ThemeSync } from "./theme-sync";

const roleLabel = { ADMIN: "Administración", TEACHER: "Docente", STUDENT: "Alumno" } as const;

export function AppShell({ user, nav, children }: { user: SessionUser; nav: NavItem[]; children: React.ReactNode }) {
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      <a href="#contenido" className="sr-only z-50 rounded-lg bg-paper px-4 py-2 font-bold focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Saltar al contenido
      </a>
      <ThemeSync preference={user.theme} />
      <aside className="border-b border-line bg-sunk md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:block md:px-4 md:pt-5">
          <Link href="/" className="font-display text-lg font-bold tracking-tight text-ink no-underline">
            Fert<span className="text-accent">elligence</span>
          </Link>
          <div className="flex items-center gap-3 md:mt-1 md:justify-between">
            <div className="font-mono text-[11px] tracking-wider text-muted uppercase">{roleLabel[user.role]}</div>
            <NotificationBell userId={user.id} />
          </div>
        </div>
        <NavLinks items={nav} />
        <div className="hidden border-t border-line p-3 md:mt-auto md:block">
          <Link href="/perfil" className="flex items-center gap-2 rounded-lg p-2 text-ink no-underline hover:bg-paper">
            <span className="grid size-8 place-items-center rounded-full bg-accent-soft font-display text-xs font-semibold text-accent">{initials}</span>
            <span className="min-w-0 truncate text-sm">
              {user.firstName} {user.lastName}
            </span>
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="mt-1 w-full rounded-lg px-2 py-2 text-left text-sm text-muted hover:bg-paper hover:text-ink">
              Salir
            </button>
          </form>
        </div>
      </aside>
      <main id="contenido" tabIndex={-1} className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
