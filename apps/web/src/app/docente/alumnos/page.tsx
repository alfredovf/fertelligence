import { prisma } from "@fertelligence/core/db";
import { studentAlerts } from "@fertelligence/core/services/reports";
import Link from "next/link";
import { EmptyState, PageHeader, Pill } from "@/components/ui";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mis alumnos · Fertelligence" };

const alertTone = { inactive: "warn", failing: "bad", overdue: "bad" } as const;

export default async function MyStudentsPage() {
  const user = await requireUser("TEACHER");
  const [assignments, alerts] = await Promise.all([
    prisma.assignment.findMany({
      where: { teacherId: user.id, active: true, student: { status: { not: "DISABLED" } } },
      include: { student: { include: { studentProfile: { include: { course: true } } } }, subject: true },
      orderBy: [{ student: { lastName: "asc" } }],
    }),
    studentAlerts(user.id),
  ]);
  const students = new Map<string, { name: string; course: string; subjects: string[]; pending: boolean }>();
  for (const a of assignments) {
    const s = students.get(a.studentId) ?? { name: `${a.student.lastName}, ${a.student.firstName}`, course: a.student.studentProfile?.course.name ?? "", subjects: [], pending: a.student.status === "PENDING_CONSENT" };
    s.subjects.push(a.subject.name);
    students.set(a.studentId, s);
  }
  const counts = await prisma.task.groupBy({ by: ["assignmentId", "status"], where: { assignment: { teacherId: user.id, active: true } }, _count: true });
  const byAssignment = new Map(assignments.map((a) => [a.id, a.studentId]));
  const pendingByStudent = new Map<string, number>();
  for (const c of counts) {
    if (!["NEW", "IN_PROGRESS", "OVERDUE", "REDO"].includes(c.status)) continue;
    const sid = byAssignment.get(c.assignmentId);
    if (sid) pendingByStudent.set(sid, (pendingByStudent.get(sid) ?? 0) + c._count);
  }

  return (
    <>
      <PageHeader title="Mis alumnos" subtitle={`${students.size} ${students.size === 1 ? "alumno" : "alumnos"}`} />
      {students.size === 0 ? (
        <EmptyState>Todavía no tenés alumnos asignados. La administración los asigna en Asignaciones.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...students.entries()].map(([id, s]) => {
            const own = alerts.filter((a) => a.studentId === id);
            return (
              <Link key={id} href={`/docente/alumnos/${id}`} className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-4 text-ink no-underline hover:border-accent">
                <div className="font-bold">{s.name}</div>
                <div className="text-sm text-muted">
                  {s.course} · {s.subjects.join(", ")}
                </div>
                <div className="flex flex-wrap gap-1">
                  {s.pending && <Pill tone="warn">Sin consentimiento</Pill>}
                  {(pendingByStudent.get(id) ?? 0) > 0 && <Pill tone="accent">{pendingByStudent.get(id)} pendientes</Pill>}
                  {own.map((a, i) => (
                    <Pill key={i} tone={alertTone[a.kind]}>
                      {a.detail}
                    </Pill>
                  ))}
                  {!s.pending && own.length === 0 && !(pendingByStudent.get(id) ?? 0) && <Pill tone="ok">Al día</Pill>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
