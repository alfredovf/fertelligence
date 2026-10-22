"use client";

import type { RosterPreview } from "@fertelligence/core/services/classroom";
import { useEffect, useState } from "react";
import { adminCoursesAction, rosterImportAction, rosterPreviewAction } from "@/app/classroom-actions";
import { Notice, Pill } from "@/components/ui";

type Option = { id: string; name: string };
const selectClass = "min-h-10 rounded-lg border border-line bg-paper px-2";

// Importar cursos de Classroom: elegir cursos, relacionarlos con curso y materia de Fertelligence, revisar y confirmar.
export function RosterImport({ courses, subjects }: { courses: Option[]; subjects: Option[] }) {
  const [classroom, setClassroom] = useState<{ id: string; name: string; section?: string }[] | null>(null);
  const [selected, setSelected] = useState<Record<string, { courseId: string; subjectId: string }>>({});
  const [previews, setPreviews] = useState<RosterPreview[] | null>(null);
  const [result, setResult] = useState<{ students: number; teachers: number; assignments: number; skipped: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminCoursesAction().then((r) => (r.error ? setError(r.error) : setClassroom(r.courses ?? [])));
  }, []);

  const ids = Object.keys(selected);
  const toggle = (id: string) => {
    setPreviews(null);
    setSelected((s) => {
      const copy = { ...s };
      if (copy[id]) delete copy[id];
      else copy[id] = { courseId: "", subjectId: "" };
      return copy;
    });
  };
  const ready = ids.length > 0 && ids.every((id) => selected[id]!.courseId && selected[id]!.subjectId);

  async function preview() {
    setBusy(true);
    setError(null);
    const r = await rosterPreviewAction(ids);
    setBusy(false);
    if (r.error) setError(r.error);
    else setPreviews(r.previews ?? []);
  }

  async function run() {
    setBusy(true);
    setError(null);
    const r = await rosterImportAction(ids.map((id) => ({ classroomCourseId: id, ...selected[id]! })));
    setBusy(false);
    if (r.error) setError(r.error);
    else setResult(r.result ?? null);
  }

  if (result) {
    return (
      <Notice tone="ok">
        Importación terminada: {result.students} alumnos nuevos, {result.teachers} docentes nuevos y {result.assignments} asignaciones. Los alumnos nuevos quedan esperando el consentimiento: cargá el email de la familia en su ficha o registralo en papel.
        {result.skipped.length > 0 && (
          <ul className="mt-2 list-disc pl-5">
            {result.skipped.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
      </Notice>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Notice tone="bad">{error}</Notice>}
      {classroom === null && !error && <p className="text-muted">Buscando cursos en Classroom…</p>}
      {classroom && classroom.length === 0 && <p className="text-muted">No encontramos cursos activos visibles para tu cuenta.</p>}
      {classroom && classroom.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-paper">
          <table className="w-full text-left text-sm">
            <thead className="text-xs font-bold tracking-wide text-muted uppercase">
              <tr>
                <th className="px-3 py-2">Importar</th>
                <th className="px-3 py-2">Curso en Classroom</th>
                <th className="px-3 py-2">Curso en Fertelligence</th>
                <th className="px-3 py-2">Materia</th>
              </tr>
            </thead>
            <tbody>
              {classroom.map((c) => {
                const sel = selected[c.id];
                return (
                  <tr key={c.id} className="border-t border-line">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={Boolean(sel)} onChange={() => toggle(c.id)} className="size-5" aria-label={`Importar ${c.name}`} />
                    </td>
                    <td className="px-3 py-2 font-bold">
                      {c.name}
                      {c.section && <span className="block text-xs font-normal text-muted">{c.section}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <select disabled={!sel} value={sel?.courseId ?? ""} onChange={(e) => setSelected((s) => ({ ...s, [c.id]: { ...s[c.id]!, courseId: e.target.value } }))} className={selectClass} aria-label="Curso en Fertelligence">
                        <option value="">Elegí</option>
                        {courses.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select disabled={!sel} value={sel?.subjectId ?? ""} onChange={(e) => setSelected((s) => ({ ...s, [c.id]: { ...s[c.id]!, subjectId: e.target.value } }))} className={selectClass} aria-label="Materia">
                        <option value="">Elegí</option>
                        {subjects.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {ids.length > 0 && !previews && (
        <button type="button" onClick={preview} disabled={!ready || busy} className="min-h-11 self-start rounded-lg bg-accent px-4 font-bold text-accent-ink disabled:opacity-50">
          {busy ? "Revisando…" : "Revisar qué se va a importar"}
        </button>
      )}
      {previews && (
        <div className="flex flex-col gap-3">
          {previews.map((p) => {
            const name = classroom?.find((c) => c.id === p.classroomCourseId)?.name;
            const newStudents = p.students.filter((s) => !s.existing).length;
            const newTeachers = p.teachers.filter((t) => !t.existing).length;
            return (
              <div key={p.classroomCourseId} className="rounded-xl border border-line bg-paper p-3 text-sm">
                <b>{name}</b>: {p.students.length} alumnos (<Pill tone="ok">{newStudents} nuevos</Pill> {p.students.length - newStudents} ya existían) · {p.teachers.length} docentes ({newTeachers} nuevos)
                {p.students.some((s) => !s.email) && <span className="block text-warn">Algunos alumnos no tienen el email visible y se van a saltear.</span>}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={run} disabled={busy} className="min-h-11 rounded-lg bg-accent px-4 font-bold text-accent-ink disabled:opacity-50">
              {busy ? "Importando…" : "Confirmar importación"}
            </button>
            <span className="text-sm text-muted">No se borra a nadie. A los docentes nuevos les enviamos el email de bienvenida.</span>
          </div>
        </div>
      )}
    </div>
  );
}
