"use client";

import type { CourseMaterial } from "@fertelligence/core/google/classroom";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { importDriveAction, importFormAction, pickerTokenAction } from "@/app/classroom-actions";
import { Notice, Pill } from "@/components/ui";
import { DrivePicker } from "./drive-picker";

// Materiales de un curso de Classroom. Un cuestionario se importa directo como múltiple choice;
// un archivo de Drive se elige con el selector y pasa por la IA (texto o foto).
export function MaterialsList({ teacherId, basePath, subjects, materials }: { teacherId: string; basePath: string; subjects: { id: string; name: string }[]; materials: CourseMaterial[] }) {
  const router = useRouter();
  const [subjectId, setSubjectId] = useState(subjects.length === 1 ? subjects[0]!.id : "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needSubject = () => {
    if (subjectId) return false;
    setError("Primero elegí la materia de la tarea.");
    return true;
  };

  async function importQuiz(formId: string) {
    if (needSubject()) return;
    setBusy(formId);
    setError(null);
    const r = await importFormAction(teacherId, subjectId, formId);
    setBusy(null);
    if (r.error || !r.templateId) setError(r.error ?? "No se pudo importar.");
    else router.push(`${basePath}/${r.templateId}/items?importada=${r.skipped ?? 0}`);
  }

  async function importFile(fileId: string) {
    if (needSubject()) return;
    setBusy(fileId);
    setError(null);
    const r = await importDriveAction(teacherId, subjectId, fileId);
    setBusy(null);
    if (r.error || !r.id) setError(r.error ?? "No se pudo importar.");
    else if (r.kind === "text") router.push(`${basePath}/nueva/texto?fuente=${r.id}${teacherId ? `&docente=${teacherId}` : ""}`);
    else router.push(`${basePath}/ia/${r.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex max-w-sm flex-col gap-1">
        <span className="text-sm font-bold text-muted">Materia de la tarea</span>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3">
          <option value="">Elegí la materia</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {error && <Notice tone="bad">{error}</Notice>}
      {materials.length === 0 && <p className="text-muted">Este curso no tiene materiales ni tareas con archivos o cuestionarios.</p>}
      <ul className="flex flex-col gap-3">
        {materials.map((m) => (
          <li key={`${m.source}-${m.id}`} className="rounded-xl border border-line bg-paper p-4">
            <div className="flex flex-wrap items-center gap-2">
              <b>{m.title}</b>
              <Pill>{m.source === "coursework" ? "Tarea de Classroom" : "Material"}</Pill>
            </div>
            <ul className="mt-2 flex flex-col gap-2">
              {m.attachments.map((a, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  {a.kind === "form" && (
                    <>
                      <Pill tone="accent">Cuestionario</Pill>
                      <span className="flex-1">{a.title}</span>
                      <button type="button" onClick={() => importQuiz(a.formId)} disabled={busy !== null} className="min-h-10 rounded-lg bg-accent px-3 font-bold text-accent-ink disabled:opacity-60">
                        {busy === a.formId ? "Importando…" : "Importar como múltiple choice"}
                      </button>
                    </>
                  )}
                  {a.kind === "drive" && (
                    <>
                      <Pill>Archivo de Drive</Pill>
                      <span className="flex-1">{a.title}</span>
                      {busy === a.fileId ? (
                        <span className="text-muted">Importando…</span>
                      ) : (
                        <DrivePicker getToken={pickerTokenAction} query={a.title} label="Elegirlo en Drive y usarlo" onPick={(id) => importFile(id)} />
                      )}
                    </>
                  )}
                  {a.kind === "link" && (
                    <>
                      <Pill>Enlace</Pill>
                      <span className="flex-1">{a.title}</span>
                      <span className="text-muted">Los enlaces no se importan</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <div className="rounded-xl border border-dashed border-line p-4 text-sm">
        <p className="mb-2">¿El archivo no está en un material del curso?</p>
        <DrivePicker getToken={pickerTokenAction} onPick={(id) => importFile(id)} />
      </div>
      <p className="text-xs text-muted">Por privacidad, Fertelligence solo puede leer los archivos que elegís en el selector de Drive. Un documento o presentación se usa como texto fuente; un PDF o una imagen, como foto del ejercicio.</p>
    </div>
  );
}
