import { prisma } from "@fertelligence/core/db";
import { redirect } from "next/navigation";
import { describeNotification } from "@/lib/notifications";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Abre un aviso: lo marca como leído y lleva a lo que corresponde.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/ingresar");
  const { id } = await params;
  const n = await prisma.notification.findFirst({ where: { id, userId: user.id } });
  if (!n) redirect("/notificaciones");
  if (!n.readAt) await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  redirect(describeNotification(n.kind, n.payload, user.role).href);
}
