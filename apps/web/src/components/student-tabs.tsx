"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/alumno", label: "Hoy" },
  { href: "/alumno/tareas", label: "Tareas" },
  { href: "/alumno/progreso", label: "Progreso" },
];

export function StudentTabs({ variant }: { variant: "top" | "bottom" }) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/alumno" ? pathname === href : pathname.startsWith(href));
  if (variant === "top") {
    return (
      <nav aria-label="Principal" className="flex gap-1">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined} className={`rounded-full px-4 py-1.5 font-bold no-underline ${active(t.href) ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"}`}>
            {t.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label="Principal" className="grid grid-cols-3">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-bold no-underline ${active(t.href) ? "text-accent" : "text-muted"}`}>
          <span className={`h-1 w-6 rounded-full ${active(t.href) ? "bg-accent" : "bg-line"}`} aria-hidden="true" />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
