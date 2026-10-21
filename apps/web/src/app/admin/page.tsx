import { prisma } from "@fertelligence/core/db";
import Link from "next/link";
import { Card, LinkButton, PageHeader, Pill } from "@/components/ui";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const user = await requireUser("ADMIN");
  const [settings, activeStudents, pendingConsent, teachers, subjects, studentsWithoutTeacher, refused] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: 1 }, include: { activeCycle: true } }),
    prisma.user.count({ where: { role: "STUDENT", status: "ACTIVE", deletedAt: null } }),
    prisma.user.count({ where: { role: "STUDENT", status: "PENDING_CONSENT", deletedAt: null } }),
    prisma.user.count({ where: { role: "TEACHER", status: "ACTIVE", deletedAt: null } }),
    prisma.subject.count({ where: { archivedAt: null } }),
    prisma.user.findMany({
      where: { role: "STUDENT", status: { not: "DISABLED" }, studentAssignments: { none: { active: true } } },
      select: { id: true, firstName: true, lastName: true },
      take: 10,
    }),
    prisma.notification.findMany({ where: { userId: user.id, kind: "consent.refused", readAt: null }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const kpis = [
    { label: "Alumnos activos", value: activeStudents, href: "/admin/alumnos" },
    { label: "Esperando consentimiento", value: pendingConsent, href: "/admin/alumnos?estado=PENDING_CONSENT" },
    { label: "Docentes", value: teachers, href: "/admin/docentes" },
    { label: "Materias", value: subjects, href: "/admin/materias" },
  ];
  const nothingPending = refused.length === 0 && pendingConsent === 0 && studentsWithoutTeacher.length === 0;

  return (
    <>
      <PageHeader
        title={`Hola, ${user.firstName}`}
        subtitle={`${settings?.name ?? ""} · Ciclo lectivo ${settings?.activeCycle?.year ?? "sin definir"}`}
        actions={
          <>
            <LinkButton href="/admin/importar">Importar planilla</LinkButton>
            <LinkButton href="/admin/alumnos/nuevo" variant="primary">
              + Alumno
            </LinkButton>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="rounded-xl border border-line bg-paper p-4 text-ink no-underline hover:border-muted">
            <div className="font-display text-3xl font-semibold tabular-nums">{k.value}</div>
            <div className="text-sm text-muted">{k.label}</div>
          </Link>
        ))}
      </div>
      <Card title="Requiere atención">
        <ul className="flex flex-col divide-y divide-line">
          {refused.map((n) => {
            const payload = n.payload as { studentId?: string; studentName?: string };
            return (
              <li key={n.id} className="flex flex-wrap items-center gap-3 py-2">
                <Pill tone="bad">Sin consentimiento</Pill>
                <span className="flex-1">La familia de {payload.studentName} no dio el consentimiento.</span>
                <Link href={`/admin/alumnos/${payload.studentId}`}>Ver</Link>
              </li>
            );
          })}
          {pendingConsent > 0 && (
            <li className="flex flex-wrap items-center gap-3 py-2">
              <Pill tone="warn">Pendiente</Pill>
              <span className="flex-1">
                {pendingConsent} {pendingConsent === 1 ? "alumno espera" : "alumnos esperan"} el consentimiento de su familia.
              </span>
              <Link href="/admin/alumnos?estado=PENDING_CONSENT">Ver</Link>
            </li>
          )}
          {studentsWithoutTeacher.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
              <Pill tone="bad">Sin docentes</Pill>
              <span className="flex-1">
                {s.firstName} {s.lastName} no tiene docentes asignados.
              </span>
              <Link href="/admin/asignaciones">Asignar</Link>
            </li>
          ))}
          {nothingPending && <li className="py-2 text-muted">Nada pendiente por ahora.</li>}
        </ul>
      </Card>
    </>
  );
}
