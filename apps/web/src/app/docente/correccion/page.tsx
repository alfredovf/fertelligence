import { CorrectionQueueView } from "@/components/corrections/pages";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Para corregir · Fertelligence" };

export default async function Page({ searchParams }: { searchParams: Promise<{ aprobada?: string }> }) {
  const user = await requireUser("TEACHER");
  const { aprobada } = await searchParams;
  return <CorrectionQueueView user={user} teacherId={user.id} basePath="/docente/correccion" approved={aprobada} />;
}
