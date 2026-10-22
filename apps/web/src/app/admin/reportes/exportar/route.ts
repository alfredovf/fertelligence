import { taskTypeLabels } from "@fertelligence/core";
import { audit } from "@fertelligence/core/audit";
import { schoolReport, toCsv } from "@fertelligence/core/services/reports";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { parseReportFilters } from "../filters";

export const dynamic = "force-dynamic";

// Exporta una tabla del reporte como CSV (se abre en Excel o Google Sheets).
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return new Response("No tenés permiso.", { status: 403 });
  const p = Object.fromEntries(request.nextUrl.searchParams);
  const { desde, hasta, filter } = parseReportFilters(p);
  const r = await schoolReport(filter);
  const tabla = p.tabla ?? "materias";
  let csv: string;
  if (tabla === "docentes") csv = toCsv(["Docente", "Asignadas", "Entregadas", "A tiempo %", "Sin corregir", "Días para corregir", "Aprobadas %", "Promedio"], r.byTeacher.map((x) => [x.name, x.assigned, x.submitted, x.onTimePercent, x.pending, x.avgCorrectionDays, x.approvalPercent, x.averageGrade]));
  else if (tabla === "tipos") csv = toCsv(["Tipo de tarea", "Asignadas", "Entregadas", "A tiempo %", "Aprobadas %", "Promedio"], r.byType.map((x) => [taskTypeLabels[x.type], x.assigned, x.submitted, x.onTimePercent, x.approvalPercent, x.averageGrade]));
  else if (tabla === "semanas") csv = toCsv(["Semana (lunes)", "Asignadas", "Aprobadas"], r.byWeek.map((x) => [x.week, x.assigned, x.passed]));
  else csv = toCsv(["Materia", "Asignadas", "Entregadas", "A tiempo %", "Aprobadas %", "Promedio"], r.bySubject.map((x) => [x.name, x.assigned, x.submitted, x.onTimePercent, x.approvalPercent, x.averageGrade]));
  await audit({ actorId: user.id, action: "report.export", entity: "report", entityId: tabla, after: { desde, hasta } });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="fertelligence-${tabla}-${desde}-a-${hasta}.csv"` } });
}
