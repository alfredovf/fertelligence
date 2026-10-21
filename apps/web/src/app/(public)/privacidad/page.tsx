import { env } from "@fertelligence/core";
import { prisma } from "@fertelligence/core/db";
import { PrivacySummary } from "@/components/privacy-summary";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Política de privacidad · Fertelligence" };

export default async function PrivacyPage() {
  const [settings, policy] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: 1 } }),
    prisma.legalDocument.findFirst({ where: { type: "PRIVACY_POLICY", effectiveFrom: { lte: new Date() } }, orderBy: { effectiveFrom: "desc" } }),
  ]);
  const school = settings?.name ?? env.schoolName;
  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-semibold">Política de privacidad</h1>
        {policy && (
          <p className="text-muted">
            Versión {policy.version} · vigente desde {policy.effectiveFrom.toLocaleDateString("es-AR", { timeZone: "UTC" })}
          </p>
        )}
      </div>
      <Card title="En pocas palabras">
        <PrivacySummary school={school} />
      </Card>
      <Card title="Texto completo">
        <p className="whitespace-pre-line text-sm">{policy?.content ?? "La política de privacidad todavía no está cargada."}</p>
      </Card>
    </>
  );
}
