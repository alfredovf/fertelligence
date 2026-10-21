import { CorrectionView } from "@/components/corrections/pages";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Corregir · Fertelligence" };

export default async function Page({ params, searchParams }: { params: Promise<{ taskId: string }>; searchParams: Promise<{ aprobada?: string }> }) {
  const user = await requireUser("ADMIN");
  const { taskId } = await params;
  const { aprobada } = await searchParams;
  return <CorrectionView user={user} taskId={taskId} basePath="/admin/correccion" approved={aprobada} />;
}
