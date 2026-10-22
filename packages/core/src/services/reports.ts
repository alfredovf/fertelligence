import type { TaskStatus } from "@prisma/client";
import { prisma } from "../db";
import type { TaskTypeName } from "../task-types";

// Indicadores, alertas y reportes. Todo se calcula a pedido desde la base (no hay tablas de resumen).

const DAY = 24 * 60 * 60 * 1000;
const OPEN: TaskStatus[] = ["NEW", "IN_PROGRESS", "OVERDUE", "REDO"];

export const INACTIVE_DAYS = 7;
export const FAILED_STREAK = 3;
export const SLOW_CORRECTION_DAYS = 5;

// Último movimiento de cada alumno: ingreso, respuesta guardada o entrega.
async function lastActivity(studentIds: string[]): Promise<Map<string, Date>> {
  const result = new Map<string, Date>();
  if (studentIds.length === 0) return result;
  const [logins, answers] = await Promise.all([
    prisma.auditLog.groupBy({ by: ["entityId"], where: { action: "auth.login", entityId: { in: studentIds } }, _max: { createdAt: true } }),
    prisma.$queryRaw<{ student_id: string; last: Date }[]>`
      SELECT a.student_id, max(an.updated_at) AS last FROM answers an
      JOIN attempts at ON at.id = an.attempt_id JOIN tasks t ON t.id = at.task_id JOIN assignments a ON a.id = t.assignment_id
      WHERE a.student_id = ANY(${studentIds}::uuid[]) GROUP BY a.student_id`,
  ]);
  for (const l of logins) if (l.entityId && l._max.createdAt) result.set(l.entityId, l._max.createdAt);
  for (const a of answers) {
    const prev = result.get(a.student_id);
    if (!prev || a.last > prev) result.set(a.student_id, a.last);
  }
  return result;
}

export type StudentAlert = { studentId: string; name: string; kind: "inactive" | "failing" | "overdue"; detail: string };

// Alertas sobre alumnos: sin actividad, varias desaprobadas seguidas, tareas vencidas.
export async function studentAlerts(teacherId: string | null, now = new Date()): Promise<StudentAlert[]> {
  const assignments = await prisma.assignment.findMany({
    where: { active: true, ...(teacherId ? { teacherId } : {}), student: { status: "ACTIVE" } },
    select: { studentId: true, student: { select: { firstName: true, lastName: true, createdAt: true } } },
  });
  const students = new Map(assignments.map((a) => [a.studentId, a.student]));
  const ids = [...students.keys()];
  const [activity, results, overdue] = await Promise.all([
    lastActivity(ids),
    prisma.result.findMany({
      where: { attempt: { task: { assignment: { studentId: { in: ids }, ...(teacherId ? { teacherId } : {}) } } } },
      select: { passed: true, approvedAt: true, attempt: { select: { task: { select: { assignment: { select: { studentId: true } } } } } } },
      orderBy: { approvedAt: "desc" },
    }),
    prisma.task.groupBy({ by: ["assignmentId"], where: { status: "OVERDUE", assignment: { studentId: { in: ids }, ...(teacherId ? { teacherId } : {}) } }, _count: true }),
  ]);
  const overdueAssignments = await prisma.assignment.findMany({ where: { id: { in: overdue.map((o) => o.assignmentId) } }, select: { id: true, studentId: true } });
  const overdueByStudent = new Map<string, number>();
  for (const o of overdue) {
    const sid = overdueAssignments.find((a) => a.id === o.assignmentId)?.studentId;
    if (sid) overdueByStudent.set(sid, (overdueByStudent.get(sid) ?? 0) + o._count);
  }

  const alerts: StudentAlert[] = [];
  for (const [id, s] of students) {
    const name = `${s.firstName} ${s.lastName}`;
    const last = activity.get(id) ?? s.createdAt;
    const days = Math.floor((now.getTime() - last.getTime()) / DAY);
    if (days >= INACTIVE_DAYS) alerts.push({ studentId: id, name, kind: "inactive", detail: activity.has(id) ? `Sin actividad hace ${days} días` : "Todavía no entró nunca" });
    const recent = results.filter((r) => r.attempt.task.assignment.studentId === id).slice(0, FAILED_STREAK);
    if (recent.length === FAILED_STREAK && recent.every((r) => !r.passed)) alerts.push({ studentId: id, name, kind: "failing", detail: `${FAILED_STREAK} tareas desaprobadas seguidas` });
    const o = overdueByStudent.get(id) ?? 0;
    if (o > 0) alerts.push({ studentId: id, name, kind: "overdue", detail: o === 1 ? "1 tarea vencida sin entregar" : `${o} tareas vencidas sin entregar` });
  }
  return alerts.sort((a, b) => a.name.localeCompare(b.name));
}

export async function teacherSummary(teacherId: string, now = new Date()) {
  const week = new Date(now.getTime() + 7 * DAY);
  const [toCorrect, dueThisWeek, drafts, slow] = await Promise.all([
    prisma.task.count({ where: { status: "COMPLETED", assignment: { teacherId } } }),
    prisma.task.count({ where: { status: { in: ["NEW", "IN_PROGRESS", "REDO"] }, dueAt: { gte: now, lte: week }, assignment: { teacherId } } }),
    prisma.taskTemplate.count({ where: { tasks: { none: {} }, OR: [{ createdById: teacherId, onBehalfOfId: null }, { onBehalfOfId: teacherId }] } }),
    prisma.task.count({ where: { status: "COMPLETED", assignment: { teacherId }, attempts: { some: { submittedAt: { lt: new Date(now.getTime() - SLOW_CORRECTION_DAYS * DAY) }, result: null } } } }),
  ]);
  return { toCorrect, dueThisWeek, drafts, slow };
}

// ---------- Reporte de un alumno ----------

export async function studentReport(studentId: string, teacherId: string | null) {
  const tasks = await prisma.task.findMany({
    where: { assignment: { studentId, ...(teacherId ? { teacherId } : {}) }, status: { notIn: ["DRAFT", "SCHEDULED"] } },
    include: { template: { select: { title: true, type: true, subject: { select: { name: true } } } }, attempts: { orderBy: { number: "desc" }, include: { result: true } } },
    orderBy: { dueAt: "desc" },
  });
  const graded = tasks.map((t) => ({ t, result: t.attempts.find((a) => a.result)?.result ?? null })).filter((x) => x.result);
  const submitted = tasks.flatMap((t) => t.attempts.filter((a) => a.submittedAt));
  const firstAttempts = tasks.map((t) => t.attempts.find((a) => a.number === 1 && a.submittedAt)).filter(Boolean);
  const minutes = submitted.map((a) => (a.submittedAt!.getTime() - a.startedAt.getTime()) / 60000).filter((m) => m > 0 && m < 240).sort((a, b) => a - b);
  const byType = new Map<TaskTypeName, number[]>();
  for (const g of graded) byType.set(g.t.template.type as TaskTypeName, [...(byType.get(g.t.template.type as TaskTypeName) ?? []), g.result!.grade]);
  const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    assigned: tasks.length,
    pending: tasks.filter((t) => OPEN.includes(t.status)).length,
    onTimePercent: firstAttempts.length ? Math.round((firstAttempts.filter((a) => !a!.late).length / firstAttempts.length) * 100) : null,
    averageGrade: average(graded.map((g) => g.result!.grade)),
    medianMinutes: minutes.length ? Math.round(minutes[Math.floor(minutes.length / 2)]!) : null,
    byType: [...byType.entries()].map(([type, grades]) => ({ type, average: average(grades)!, count: grades.length })).sort((a, b) => b.average - a.average),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.template.title,
      subject: t.template.subject.name,
      type: t.template.type as TaskTypeName,
      status: t.status,
      dueAt: t.dueAt,
      late: Boolean(t.attempts.find((a) => a.submittedAt)?.late),
      attempts: t.currentAttempt,
      grade: t.attempts.find((a) => a.result)?.result?.grade ?? null,
      passed: t.attempts.find((a) => a.result)?.result?.passed ?? null,
    })),
  };
}

// ---------- Reporte de la escuela ----------

export type SchoolReportFilter = { from: Date; to: Date; courseId?: string | null };

export async function schoolReport(filter: SchoolReportFilter) {
  const tasks = await prisma.task.findMany({
    where: {
      status: { notIn: ["DRAFT"] },
      dueAt: { gte: filter.from, lte: filter.to },
      ...(filter.courseId ? { assignment: { student: { studentProfile: { courseId: filter.courseId } } } } : {}),
    },
    include: {
      template: { select: { type: true, subject: { select: { name: true } } } },
      assignment: { select: { teacher: { select: { id: true, firstName: true, lastName: true } } } },
      attempts: { orderBy: { number: "asc" }, include: { result: true } },
    },
  });
  type Row = { assigned: number; submitted: number; onTime: number; graded: number; passed: number; gradeSum: number };
  const empty = (): Row => ({ assigned: 0, submitted: 0, onTime: 0, graded: 0, passed: 0, gradeSum: 0 });
  const bySubject = new Map<string, Row>();
  const byType = new Map<string, Row>();
  const byTeacher = new Map<string, Row & { name: string; correctionDays: number[]; pending: number }>();
  const byWeek = new Map<string, { assigned: number; passed: number }>();

  for (const t of tasks) {
    const first = t.attempts[0];
    const last = [...t.attempts].reverse().find((a) => a.result);
    const add = (row: Row) => {
      row.assigned++;
      if (first?.submittedAt) {
        row.submitted++;
        if (!first.late) row.onTime++;
      }
      if (last?.result) {
        row.graded++;
        row.gradeSum += last.result.grade;
        if (last.result.passed) row.passed++;
      }
    };
    const subject = t.template.subject.name;
    if (!bySubject.has(subject)) bySubject.set(subject, empty());
    add(bySubject.get(subject)!);
    if (!byType.has(t.template.type)) byType.set(t.template.type, empty());
    add(byType.get(t.template.type)!);
    const teacher = t.assignment.teacher;
    if (!byTeacher.has(teacher.id)) byTeacher.set(teacher.id, { ...empty(), name: `${teacher.firstName} ${teacher.lastName}`, correctionDays: [], pending: 0 });
    const tr = byTeacher.get(teacher.id)!;
    add(tr);
    if (t.status === "COMPLETED") tr.pending++;
    for (const a of t.attempts) if (a.submittedAt && a.result) tr.correctionDays.push((a.result.approvedAt.getTime() - a.submittedAt.getTime()) / DAY);
    // Semana (lunes) de la fecha de entrega, en hora de Argentina
    const local = new Date(t.dueAt.getTime() - 3 * 3600_000);
    const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - ((local.getUTCDay() + 6) % 7)));
    const key = monday.toISOString().slice(0, 10);
    const w = byWeek.get(key) ?? { assigned: 0, passed: 0 };
    w.assigned++;
    if (last?.result?.passed) w.passed++;
    byWeek.set(key, w);
  }

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
  const summarize = (r: Row) => ({ assigned: r.assigned, submitted: r.submitted, onTimePercent: pct(r.onTime, r.submitted), approvalPercent: pct(r.passed, r.graded), averageGrade: r.graded ? Math.round((r.gradeSum / r.graded) * 10) / 10 : null });
  return {
    totals: summarize([...bySubject.values()].reduce((acc, r) => ({ assigned: acc.assigned + r.assigned, submitted: acc.submitted + r.submitted, onTime: acc.onTime + r.onTime, graded: acc.graded + r.graded, passed: acc.passed + r.passed, gradeSum: acc.gradeSum + r.gradeSum }), empty())),
    bySubject: [...bySubject.entries()].map(([name, r]) => ({ name, ...summarize(r) })).sort((a, b) => a.name.localeCompare(b.name)),
    byType: [...byType.entries()].map(([type, r]) => ({ type: type as TaskTypeName, ...summarize(r) })),
    byTeacher: [...byTeacher.values()]
      .map((r) => ({ name: r.name, ...summarize(r), pending: r.pending, avgCorrectionDays: r.correctionDays.length ? Math.round((r.correctionDays.reduce((a, b) => a + b, 0) / r.correctionDays.length) * 10) / 10 : null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    byWeek: [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({ week, ...v })),
  };
}

// CSV con separador punto y coma (lo que espera Excel en español) y BOM para los acentos.
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : typeof v === "number" ? String(v).replace(".", ",") : v; // coma decimal
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(";")).join("\n") + "\n";
}
