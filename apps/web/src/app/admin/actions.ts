"use server";

import type { Role } from "@prisma/client";
import { audit } from "@fertelligence/core/audit";
import { prisma } from "@fertelligence/core/db";
import { storeFile } from "@fertelligence/core/files";
import { sendInvitation } from "@fertelligence/core/services/accounts";
import { recordPaperConsent, requestConsent, revokeConsent } from "@fertelligence/core/services/consent";
import { previewImport, runImport, type ImportKind, type ImportRow } from "@fertelligence/core/services/import";
import { createPerson, saveCourse, saveSubject, setAssignment, setPersonActive, setSubjectArchived, updatePerson } from "@fertelligence/core/services/school";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { requireActionUser } from "@/lib/session";

const admin = () => requireActionUser("ADMIN");
const str = (form: FormData, key: string) => String(form.get(key) ?? "");
const fields = (form: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, str(form, k)]));
const personPath = (role: Role) => (role === "STUDENT" ? "/admin/alumnos" : role === "TEACHER" ? "/admin/docentes" : "/admin/configuracion");

// ---------- Materias y cursos ----------

export async function saveSubjectAction(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await admin();
  const result = await saveSubject(id, { ...fields(form, ["name", "area", "description"]), color: str(form, "color") || null }, user.id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/materias");
  if (!id) redirect("/admin/materias");
  return { success: "Guardamos la materia." };
}

export async function toggleSubjectArchivedAction(id: string, archived: boolean): Promise<void> {
  const user = await admin();
  await setSubjectArchived(id, archived, user.id);
  revalidatePath("/admin/materias");
}

export async function saveCourseAction(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await admin();
  const result = await saveCourse(id, fields(form, ["name"]), user.id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/cursos");
  return { success: id ? "Guardamos el curso." : `Creamos el curso ${str(form, "name")}.` };
}

// ---------- Personas ----------

function personInput(role: Role, form: FormData) {
  if (role === "STUDENT") return fields(form, ["firstName", "lastName", "email", "courseId", "familyContactName", "familyContactEmail", "familyContactPhone"]);
  if (role === "TEACHER") return { ...fields(form, ["firstName", "lastName", "email"]), subjectIds: form.getAll("subjectIds").map(String) };
  return fields(form, ["firstName", "lastName", "email"]);
}

export async function createPersonAction(role: Role, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await admin();
  const result = await createPerson(role, personInput(role, form), user.id);
  if (!result.ok) return { error: result.error };
  revalidatePath(personPath(role));
  redirect(role === "ADMIN" ? "/admin/configuracion" : `${personPath(role)}/${result.value.id}?creado=1`);
}

export async function updatePersonAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await admin();
  const person = await prisma.user.findUniqueOrThrow({ where: { id } });
  const result = await updatePerson(id, personInput(person.role, form), user.id);
  if (!result.ok) return { error: result.error };
  revalidatePath(personPath(person.role));
  return { success: "Guardamos los cambios." };
}

export async function setPersonActiveAction(id: string, active: boolean, _: ActionState): Promise<ActionState> {
  const user = await admin();
  const result = await setPersonActive(id, active, user.id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin", "layout");
  return { success: active ? "La cuenta está activa." : "Desactivamos la cuenta y cerramos sus sesiones." };
}

export async function resendInvitationAction(id: string, _: ActionState): Promise<ActionState> {
  const user = await admin();
  await sendInvitation(id, user.id);
  return { success: "Enviamos de nuevo el email de bienvenida." };
}

// ---------- Consentimiento ----------

export async function requestConsentAction(studentId: string, _: ActionState): Promise<ActionState> {
  const user = await admin();
  const result = await requestConsent(studentId, { actorId: user.id });
  return result.ok ? { success: "Enviamos el pedido de consentimiento a la familia." } : { error: result.error };
}

export async function paperConsentAction(studentId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await admin();
  const grantorName = str(form, "grantorName").trim();
  const grantorRelationship = str(form, "grantorRelationship").trim();
  const signedOn = new Date(`${str(form, "signedOn")}T12:00:00-03:00`);
  if (!grantorName || !grantorRelationship) return { error: "Completá el nombre y el vínculo de quien firmó." };
  if (Number.isNaN(signedOn.getTime()) || signedOn.getTime() > Date.now() + 86_400_000) return { error: "La fecha de firma no es válida." };
  let evidenceFileId: string | null = null;
  const file = form.get("evidence");
  if (file instanceof File && file.size > 0) {
    const stored = await storeFile(Buffer.from(await file.arrayBuffer()), user.id);
    if (!stored.ok) return { error: stored.error };
    evidenceFileId = stored.id;
  }
  await recordPaperConsent(studentId, { grantorName, grantorRelationship, signedOn, evidenceFileId }, user.id);
  revalidatePath("/admin", "layout");
  return { success: "Registramos el consentimiento en papel. Le enviamos al alumno su email de bienvenida." };
}

export async function revokeConsentAction(studentId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await admin();
  if (form.get("confirm") !== "on") return { error: "Marcá la casilla para confirmar la revocación." };
  await revokeConsent(studentId, user.id);
  revalidatePath("/admin", "layout");
  return { success: "Registramos la revocación. La cuenta del alumno quedó desactivada." };
}

// ---------- Asignaciones ----------

// Cada select se llama "a:<studentId>:<subjectId>" y su valor es el id del docente ("" = sin docente).
export async function saveAssignmentsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await admin();
  let changed = 0;
  const errors: string[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("a:")) continue;
    const [, studentId, subjectId] = key.split(":");
    const original = str(form, `o:${studentId}:${subjectId}`);
    const teacherId = String(value);
    if (!studentId || !subjectId || teacherId === original) continue;
    const result = await setAssignment(studentId, subjectId, teacherId || null, user.id);
    if (result.ok) changed++;
    else errors.push(result.error);
  }
  revalidatePath("/admin/asignaciones");
  if (errors.length) return { error: `Se guardaron ${changed} cambios. No se pudieron guardar ${errors.length}: ${errors[0]}` };
  return { success: changed ? `Guardamos ${changed} ${changed === 1 ? "cambio" : "cambios"}.` : "No había cambios para guardar." };
}

// ---------- Importación ----------

export type ImportState = { error?: string; success?: string; kind?: ImportKind; csv?: string; rows?: ImportRow[]; failed?: { line: number; error: string }[] } | null;

export async function importAction(_: ImportState, form: FormData): Promise<ImportState> {
  const user = await admin();
  const kind = str(form, "kind") === "TEACHER" ? "TEACHER" : "STUDENT";
  let csv = str(form, "csv");
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) return { error: "La planilla supera los 2 MB.", kind };
    csv = await file.text();
  }
  if (!csv.trim()) return { error: "Elegí un archivo CSV.", kind };

  if (str(form, "step") === "confirm") {
    const result = await runImport(kind, csv, user.id);
    await audit({ actorId: user.id, action: "import.run", entity: kind === "STUDENT" ? "students" : "teachers", after: { created: result.created, skipped: result.skipped, failed: result.failed.length } });
    revalidatePath("/admin", "layout");
    return {
      kind,
      success: `Creamos ${result.created} ${kind === "STUDENT" ? "alumnos" : "docentes"}. ${result.skipped ? `${result.skipped} ya existían y se saltearon.` : ""}`,
      failed: result.failed,
    };
  }
  const preview = await previewImport(kind, csv);
  if (preview.error) return { error: preview.error, kind };
  return { kind, csv, rows: preview.rows };
}

// ---------- Configuración ----------

export async function saveSettingsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await admin();
  const name = str(form, "name").trim();
  const passGrade = Number(str(form, "passGrade"));
  const budget = Number(str(form, "aiMonthlyBudgetUsd").replace(",", "."));
  if (!name) return { error: "Completá el nombre de la escuela." };
  if (!Number.isInteger(passGrade) || passGrade < 1 || passGrade > 10) return { error: "La nota de aprobación tiene que ser un entero de 1 a 10." };
  if (!Number.isFinite(budget) || budget < 0 || budget > 10000) return { error: "El tope de IA no es válido." };
  const before = await prisma.schoolSettings.findUnique({ where: { id: 1 } });
  const after = await prisma.schoolSettings.update({
    where: { id: 1 },
    data: { name, passGrade, aiMonthlyBudgetUsd: budget, googleLoginEnabled: form.get("googleLoginEnabled") === "on", achievementsEnabled: form.get("achievementsEnabled") === "on" },
  });
  await audit({ actorId: user.id, action: "settings.update", entity: "school_settings", entityId: "1", before, after });
  revalidatePath("/admin", "layout");
  return { success: "Guardamos la configuración." };
}
