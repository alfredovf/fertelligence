import { prisma } from "@fertelligence/core/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { createPersonAction } from "../../actions";
import { PersonFields } from "../../person-form";

export const metadata = { title: "Nuevo docente · Fertelligence" };

export default async function NewTeacherPage() {
  await requireUser("ADMIN");
  const subjects = await prisma.subject.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Nuevo docente" back={{ href: "/admin/docentes", label: "Docentes" }} />
      <Card className="max-w-2xl">
        <ActionForm action={createPersonAction.bind(null, "TEACHER")}>
          <PersonFields role="TEACHER" subjects={subjects} />
          <p className="text-sm text-muted">Al crearlo le enviamos un email de bienvenida para que entre con Google o cree su contraseña.</p>
          <SubmitButton>Crear docente</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
