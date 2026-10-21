import { STUDENT_COLUMNS, TEACHER_COLUMNS } from "@fertelligence/core/services/import";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Planilla de ejemplo con los encabezados correctos y una fila de muestra.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return new Response("No tenés permiso.", { status: 403 });
  const teachers = request.nextUrl.searchParams.get("tipo") === "docentes";
  const header = (teachers ? TEACHER_COLUMNS : STUDENT_COLUMNS).join(",");
  const example = teachers ? "Marcela,López,mlopez@escuela.edu.ar,Ciencias Naturales;Matemática" : "Tomás,Ramírez,tomas.ramirez@escuela.edu.ar,4° B,Carla Ramírez,carla@ejemplo.com,11 5555-0142";
  return new Response(`﻿${header}\n${example}\n`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${teachers ? "docentes" : "alumnos"}.csv"` },
  });
}
