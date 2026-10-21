import Papa from "papaparse";
import { prisma } from "../db";
import { normalizeEmail } from "./accounts";
import { createPerson, studentInput, teacherInput } from "./school";

// Importación por planilla (CSV, separado por comas o punto y coma, con encabezados).
// Primero se valida todo y se muestra una vista previa; recién al confirmar se crean las personas.

export const STUDENT_COLUMNS = ["nombre", "apellido", "email", "curso", "nombre_familia", "email_familia", "telefono_familia"] as const;
export const TEACHER_COLUMNS = ["nombre", "apellido", "email", "materias"] as const;

export type ImportKind = "STUDENT" | "TEACHER";
export type ImportRow = { line: number; name: string; email: string; data: Record<string, unknown> | null; error: string | null; status: "new" | "exists" | "invalid" };

const normalizeHeader = (h: string) => h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_");

export async function previewImport(kind: ImportKind, csv: string): Promise<{ rows: ImportRow[]; error: string | null }> {
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: normalizeHeader });
  const required = kind === "STUDENT" ? ["nombre", "apellido", "email", "curso"] : ["nombre", "apellido", "email"];
  const headers = parsed.meta.fields ?? [];
  const missing = required.filter((c) => !headers.includes(c));
  if (missing.length) return { rows: [], error: `A la planilla le faltan las columnas: ${missing.join(", ")}.` };
  if (parsed.data.length > 1000) return { rows: [], error: "La planilla tiene más de 1000 filas. Dividila en partes." };

  const settings = await prisma.schoolSettings.findUnique({ where: { id: 1 } });
  const courses = await prisma.course.findMany({ where: { cycleId: settings?.activeCycleId ?? undefined } });
  const subjects = await prisma.subject.findMany({ where: { archivedAt: null } });
  const emails = parsed.data.map((r) => normalizeEmail(r.email ?? ""));
  const existing = new Set((await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } })).map((u) => u.email));
  const seen = new Set<string>();

  const rows = parsed.data.map((raw, index): ImportRow => {
    const line = index + 2; // la fila 1 son los encabezados
    const mail = normalizeEmail(raw.email ?? "");
    const name = `${raw.nombre ?? ""} ${raw.apellido ?? ""}`.trim();
    const invalid = (error: string): ImportRow => ({ line, name, email: mail, data: null, error, status: "invalid" });
    if (seen.has(mail)) return invalid("Email repetido en la planilla.");
    seen.add(mail);
    if (existing.has(mail)) return { line, name, email: mail, data: null, error: null, status: "exists" };

    if (kind === "STUDENT") {
      const course = courses.find((c) => c.name.toLowerCase() === (raw.curso ?? "").trim().toLowerCase());
      if (!course) return invalid(`No existe el curso "${raw.curso ?? ""}". Crealo primero.`);
      const data = { firstName: raw.nombre, lastName: raw.apellido, email: mail, courseId: course.id, familyContactName: raw.nombre_familia ?? "", familyContactEmail: raw.email_familia ?? "", familyContactPhone: raw.telefono_familia ?? "" };
      const check = studentInput.safeParse(data);
      return check.success ? { line, name, email: mail, data, error: null, status: "new" } : invalid(check.error.issues[0]?.message ?? "Datos inválidos.");
    }
    const names = (raw.materias ?? "").split(/[;|]/).map((s) => s.trim()).filter(Boolean);
    const subjectIds: string[] = [];
    for (const subjectName of names) {
      const subject = subjects.find((s) => s.name.toLowerCase() === subjectName.toLowerCase());
      if (!subject) return invalid(`No existe la materia "${subjectName}".`);
      subjectIds.push(subject.id);
    }
    const data = { firstName: raw.nombre, lastName: raw.apellido, email: mail, subjectIds };
    const check = teacherInput.safeParse(data);
    return check.success ? { line, name, email: mail, data, error: null, status: "new" } : invalid(check.error.issues[0]?.message ?? "Datos inválidos.");
  });
  return { rows, error: null };
}

// Crea solo las filas válidas y nuevas. Los que ya existen se saltean.
export async function runImport(kind: ImportKind, csv: string, actorId: string): Promise<{ created: number; skipped: number; failed: { line: number; error: string }[] }> {
  const { rows, error } = await previewImport(kind, csv);
  if (error) return { created: 0, skipped: 0, failed: [{ line: 0, error }] };
  let created = 0;
  const failed: { line: number; error: string }[] = [];
  for (const row of rows) {
    if (row.status !== "new" || !row.data) {
      if (row.status === "invalid") failed.push({ line: row.line, error: row.error ?? "Datos inválidos." });
      continue;
    }
    const result = await createPerson(kind, row.data, actorId);
    if (result.ok) created++;
    else failed.push({ line: row.line, error: result.error });
  }
  return { created, skipped: rows.filter((r) => r.status === "exists").length, failed };
}
