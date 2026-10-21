import { prisma } from "@fertelligence/core/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { createPersonAction } from "../../actions";
import { PersonFields } from "../../person-form";

export const metadata = { title: "Nuevo alumno · Fertelligence" };

export default async function NewStudentPage() {
  await requireUser("ADMIN");
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 1 } });
  const courses = await prisma.course.findMany({ where: { cycleId: settings?.activeCycleId ?? undefined }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Nuevo alumno" back={{ href: "/admin/alumnos", label: "Alumnos" }} />
      <Card className="max-w-2xl">
        <ActionForm action={createPersonAction.bind(null, "STUDENT")}>
          <PersonFields role="STUDENT" courses={courses} />
          <p className="text-sm text-muted">
            El alumno queda esperando el consentimiento de su familia. Si cargás el email de la familia, le enviamos el pedido ahora. Si no, podés registrar un consentimiento en papel desde su ficha.
          </p>
          <SubmitButton>Crear alumno</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
