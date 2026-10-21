import { taskTypeLabels } from "@fertelligence/core";
import { prisma } from "@fertelligence/core/db";
import { ownedBy } from "@fertelligence/core/services/tasks";
import Link from "next/link";
import { Card, LinkButton, Notice, PageHeader, Pill, Table } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Inicio del docente: avisos, últimas tareas y sus alumnos. La bandeja de corrección llega en la etapa 4.
export default async function TeacherHome() {
  const user = await requireUser("TEACHER");
  const [assignments, templates, notifications] = await Promise.all([
    prisma.assignment.findMany({
      where: { teacherId: user.id, active: true },
      include: { student: { include: { studentProfile: { include: { course: true } } } }, subject: true },
      orderBy: [{ subject: { name: "asc" } }, { student: { lastName: "asc" } }],
    }),
    prisma.taskTemplate.findMany({ where: ownedBy(user.id), include: { subject: true, _count: { select: { tasks: true } }, tasks: { select: { dueAt: true }, orderBy: { dueAt: "asc" }, take: 1 } }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.notification.findMany({ where: { userId: user.id, readAt: null, kind: "task.created_on_behalf" }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  return (
    <>
      <PageHeader title={`Hola, ${user.firstName}`} actions={<LinkButton href="/docente/tareas/nueva" variant="primary">+ Nueva tarea</LinkButton>} />
      {notifications.map((n) => {
        const p = n.payload as { templateId?: string; title?: string; by?: string };
        return (
          <Notice key={n.id}>
            {p.by} cargó en tu nombre la tarea <Link href={`/docente/tareas/${p.templateId}`}>{p.title}</Link>.
          </Notice>
        );
      })}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Últimas tareas" actions={<Link href="/docente/tareas">Ver todas</Link>}>
          {templates.length === 0 ? (
            <p className="text-muted">
              Todavía no creaste tareas. <Link href="/docente/tareas/nueva">Crear la primera</Link>
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {templates.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Link href={`/docente/tareas/${t.id}`} className="font-bold">
                    {t.title}
                  </Link>
                  <span className="text-sm text-muted">
                    {t.subject.name} · {taskTypeLabels[t.type]}
                  </span>
                  <span className="flex-1" />
                  {t._count.tasks === 0 ? <Pill>Borrador</Pill> : <Pill tone="accent">{t._count.tasks} alumnos{t.tasks[0] && ` · entrega ${formatDate(t.tasks[0].dueAt)}`}</Pill>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Mis alumnos (${new Set(assignments.map((a) => a.studentId)).size})`}>
          <Table>
            <thead>
              <tr>
                <th>Alumno</th>
                <th>Materia</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.student.firstName} {a.student.lastName}
                    <div className="text-xs text-muted">{a.student.studentProfile?.course.name}</div>
                  </td>
                  <td>{a.subject.name}</td>
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr>
                  <td colSpan={2} className="text-center text-muted">
                    Todavía no tenés alumnos asignados.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
