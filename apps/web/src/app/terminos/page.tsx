import { audit } from "@fertelligence/core/audit";
import { prisma } from "@fertelligence/core/db";
import { homeForRole } from "@fertelligence/core/auth/session";
import { redirect } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { requireActionUser, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Términos de uso · Fertelligence" };

async function currentTerms() {
  return prisma.legalDocument.findFirst({ where: { type: "TERMS", effectiveFrom: { lte: new Date() } }, orderBy: { effectiveFrom: "desc" } });
}

async function acceptTerms() {
  "use server";
  const user = await requireActionUser();
  const terms = await currentTerms();
  if (terms) {
    await prisma.termsAcceptance.upsert({ where: { userId_legalDocumentId: { userId: user.id, legalDocumentId: terms.id } }, create: { userId: user.id, legalDocumentId: terms.id }, update: {} });
    await audit({ actorId: user.id, action: "terms.accept", entity: "legal_document", entityId: terms.id });
  }
  redirect(homeForRole[user.role]);
}

export default async function TermsPage() {
  const user = await requireUser();
  const terms = await currentTerms();
  if (!terms) redirect(homeForRole[user.role]);
  const student = user.role === "STUDENT";

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-10">
      <div className="font-display text-xl font-bold">
        Fert<span className="text-accent">elligence</span>
      </div>
      <h1 className="font-display text-2xl font-semibold">Antes de empezar, {user.firstName}</h1>
      <Card>
        {student ? (
          <p>
            Tu cuenta es solo tuya, así que no compartas tu contraseña. Usá Fertelligence para tus tareas de la escuela, resolvelas vos y escribí con respeto. Tus respuestas y notas las ven solo tus docentes y la escuela.
          </p>
        ) : (
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>Usá la plataforma solo para actividades escolares y cuidá tu contraseña.</li>
            <li>Accedé solo a los datos de los alumnos que tenés asignados y solo con fines educativos.</li>
            <li>Revisá lo que genere la inteligencia artificial antes de publicarlo: sos responsable del contenido de tus tareas y de las notas que aprobás.</li>
            <li>Respetá los derechos de autor del material que subas.</li>
          </ul>
        )}
        <p className="mt-3 text-sm text-muted">Términos de uso, versión {terms.version}.</p>
      </Card>
      <form action={acceptTerms}>
        <Button type="submit" variant="primary" className="w-full">
          {student ? "Entendido, empezar" : "Acepto los términos de uso"}
        </Button>
      </form>
    </main>
  );
}
