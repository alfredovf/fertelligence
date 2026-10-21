import type { UserStatus } from "@prisma/client";
import { prisma } from "@fertelligence/core/db";
import Link from "next/link";
import { Input, LinkButton, PageHeader, Select, Table } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { StatusPill } from "../person-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alumnos · Fertelligence" };

const STATUSES: { value: UserStatus | ""; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "ACTIVE", label: "Activos" },
  { value: "PENDING_CONSENT", label: "Esperando consentimiento" },
  { value: "DISABLED", label: "Desactivados" },
];

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; curso?: string; estado?: string }> }) {
  await requireUser("ADMIN");
  const { q, curso, estado } = await searchParams;
  const query = q?.trim();
  const status = STATUSES.find((s) => s.value && s.value === estado)?.value || undefined;
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 1 } });
  const courses = await prisma.course.findMany({ where: { cycleId: settings?.activeCycleId ?? undefined }, orderBy: { name: "asc" } });
  const students = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      ...(status ? { status } : {}),
      ...(curso ? { studentProfile: { courseId: curso } } : {}),
      ...(query ? { OR: [{ firstName: { contains: query, mode: "insensitive" } }, { lastName: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] } : {}),
    },
    include: { studentProfile: { include: { course: true } }, _count: { select: { studentAssignments: { where: { active: true } } } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 500,
  });

  return (
    <>
      <PageHeader
        title="Alumnos"
        subtitle={`${students.length} ${students.length === 1 ? "alumno" : "alumnos"}`}
        actions={
          <>
            <LinkButton href="/admin/importar">Importar planilla</LinkButton>
            <LinkButton href="/admin/alumnos/nuevo" variant="primary">
              + Nuevo alumno
            </LinkButton>
          </>
        }
      />
      <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <Input name="q" defaultValue={query} placeholder="Buscar por nombre o email" aria-label="Buscar alumno" />
        <Select name="curso" defaultValue={curso ?? ""} aria-label="Curso">
          <option value="">Todos los cursos</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="estado" defaultValue={status ?? ""} aria-label="Estado">
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <button type="submit" className="min-h-11 rounded-lg border border-line bg-paper px-4 font-bold">
          Filtrar
        </button>
      </form>
      <Table>
        <thead>
          <tr>
            <th>Alumno</th>
            <th>Curso</th>
            <th className="text-right">Materias</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.id}>
              <td>
                <Link href={`/admin/alumnos/${s.id}`} className="font-bold">
                  {s.lastName}, {s.firstName}
                </Link>
                <div className="text-xs text-muted">{s.email}</div>
              </td>
              <td>{s.studentProfile?.course.name ?? "—"}</td>
              <td className="text-right">{s._count.studentAssignments}</td>
              <td>
                <StatusPill status={s.status} />
              </td>
            </tr>
          ))}
          {students.length === 0 && (
            <tr>
              <td colSpan={4} className="text-center text-muted">
                No hay alumnos con esos filtros.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </>
  );
}
