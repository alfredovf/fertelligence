import { prisma } from "@fertelligence/core/db";
import Link from "next/link";

// Campana con la cantidad de avisos sin leer.
export async function NotificationBell({ userId }: { userId: string }) {
  const unread = await prisma.notification.count({ where: { userId, readAt: null } });
  return (
    <Link href="/notificaciones" aria-label={unread ? `Avisos: ${unread} sin leer` : "Avisos"} className="relative grid size-9 place-items-center rounded-full border border-line bg-paper text-ink no-underline hover:border-muted">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-bad px-1 text-center text-[11px] leading-5 font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
    </Link>
  );
}
