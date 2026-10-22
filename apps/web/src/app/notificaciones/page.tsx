import { prisma } from "@fertelligence/core/db";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { describeNotification } from "@/lib/notifications";
import { requireActionUser, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Avisos · Fertelligence" };

async function markAllRead() {
  "use server";
  const user = await requireActionUser();
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader
        title="Avisos"
        subtitle={unread ? `${unread} sin leer` : "Estás al día"}
        actions={
          unread > 0 && (
            <form action={markAllRead}>
              <Button type="submit">Marcar todos como leídos</Button>
            </form>
          )
        }
      />
      {items.length === 0 ? (
        <EmptyState>Todavía no tenés avisos.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-paper">
          {items.map((n) => {
            const d = describeNotification(n.kind, n.payload, user.role);
            return (
              <li key={n.id}>
                <Link href={`/notificaciones/ir/${n.id}`} className={`flex items-start gap-3 px-4 py-3 text-ink no-underline hover:bg-sunk ${n.readAt ? "" : "bg-accent-soft"}`}>
                  <span className={`mt-2 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent"}`} aria-hidden="true" />
                  <span className="flex-1">
                    {d.text}
                    <span className="block text-xs text-muted">{formatDateTime(n.createdAt)}</span>
                  </span>
                  {!n.readAt && <span className="sr-only">Sin leer</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
