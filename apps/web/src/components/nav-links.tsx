"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; badge?: number };

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || (href.split("/").length > 2 && pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="Principal" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0">
      {[...items, { href: "/perfil", label: "Mi perfil" }].map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 shrink-0 items-center justify-between gap-2 rounded-lg px-3 text-sm no-underline ${active ? "bg-accent font-bold text-accent-ink" : "text-ink hover:bg-paper"} ${item.href === "/perfil" ? "md:hidden" : ""}`}
          >
            {item.label}
            {item.badge ? <span className="rounded-full bg-bad px-1.5 text-[11px] font-bold text-white">{item.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
