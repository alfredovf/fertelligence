import { prisma } from "@fertelligence/core/db";
import Link from "next/link";
import { Input, LinkButton, PageHeader, Pill, Table } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { StatusPill } from "../person-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Docentes · Fertelligence" };

export default async function TeachersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser("ADMIN");
  const { q } = await searchParams;
  const query = q?.trim();
  const teachers = await prisma.user.findMany({
    where: {
      role: "TEACHER",
      ...(query ? { OR: [{ firstName: { contains: query, mode: "insensitive" } }, { lastName: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] } : {}),
    },
    include: { teacherSubjects: { include: { subject: true } }, _count: { select: { teacherAssignments: { where: { active: true } } } } },
    orderBy: [{ status: "asc" }, { lastName: "asc" }],
  });
  const loggedIn = new Set((await prisma.auditLog.findMany({ where: { action: "auth.login", entityId: { in: teachers.map((t) => t.id) } }, distinct: ["entityId"], select: { entityId: true } })).map((r) => r.entityId));

  return (
    <>
      <PageHeader
        title="Docentes"
        subtitle={`${teachers.length} ${teachers.length === 1 ? "docente" : "docentes"}`}
        actions={
          <>
            <LinkButton href="/admin/importar?tipo=docentes">Importar planilla</LinkButton>
            <LinkButton href="/admin/docentes/nuevo" variant="primary">
              + Nuevo docente
            </LinkButton>
          </>
        }
      />
      <form className="flex gap-2">
        <Input name="q" defaultValue={query} placeholder="Buscar por nombre o email" aria-label="Buscar docente" />
      </form>
      <Table>
        <thead>
          <tr>
            <th>Docente</th>
            <th>Materias</th>
            <th className="text-right">Asignaciones</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {teachers.map((t) => (
            <tr key={t.id}>
              <td>
                <Link href={`/admin/docentes/${t.id}`} className="font-bold">
                  {t.firstName} {t.lastName}
                </Link>
                <div className="text-xs text-muted">{t.email}</div>
              </td>
              <td>
                <div className="flex flex-wrap gap-1">
                  {t.teacherSubjects.map((ts) => (
                    <Pill key={ts.subjectId}>{ts.subject.name}</Pill>
                  ))}
                </div>
              </td>
              <td className="text-right">{t._count.teacherAssignments}</td>
              <td>
                <StatusPill status={t.status} neverLoggedIn={!loggedIn.has(t.id)} />
              </td>
            </tr>
          ))}
          {teachers.length === 0 && (
            <tr>
              <td colSpan={4} className="text-center text-muted">
                {query ? "No encontramos docentes con esa búsqueda." : "Todavía no hay docentes."}
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </>
  );
}
