"use client";

import { taskTypeLabels, type TaskTypeName } from "@fertelligence/core";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/components/action-form";
import { DictateButton } from "@/components/student/speech";
import { Notice } from "@/components/ui";

const inputClass = "block w-full min-h-11 rounded-lg border border-line bg-paper px-3 text-ink";

const elementsLabel: Record<TaskTypeName, string | null> = {
  MULTIPLE_CHOICE: "Opciones por pregunta",
  TRUE_FALSE: null,
  MATCHING: "Parejas por ítem",
  FILL_BLANKS: "Huecos por párrafo",
  STRIKE_OUT: "Frases por ítem",
};
const itemsLabel: Record<TaskTypeName, string> = {
  MULTIPLE_CHOICE: "Cantidad de preguntas",
  TRUE_FALSE: "Cantidad de afirmaciones",
  MATCHING: "Cantidad de ejercicios de unir",
  FILL_BLANKS: "Cantidad de párrafos",
  STRIKE_OUT: "Cantidad de textos",
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-accent px-5 font-bold text-accent-ink disabled:opacity-60">
      {pending ? "Enviando…" : "Generar tarea"}
    </button>
  );
}

// Crear desde un texto: escribirlo o pegarlo, dictarlo o sacarlo de una foto; elegir tipo y cantidades.
export function TextSourceForm({
  subjects,
  action,
  transcribe,
  initialText,
  initialSubjectId,
}: {
  subjects: { id: string; name: string }[];
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  transcribe: (form: FormData) => Promise<{ text?: string; error?: string }>;
  initialText?: string;
  initialSubjectId?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const [text, setText] = useState(initialText ?? "");
  const [tab, setTab] = useState<"write" | "dictate" | "photo">("write");
  const [type, setType] = useState<TaskTypeName>("MULTIPLE_CHOICE");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const photos = useRef<HTMLInputElement>(null);

  async function readPhotos() {
    const files = photos.current?.files;
    if (!files?.length) return;
    setReading(true);
    setReadError(null);
    const form = new FormData();
    for (const f of Array.from(files).slice(0, 3)) form.append("photos", f);
    const result = await transcribe(form).catch(() => ({ error: "No se pudo leer la foto." }) as { text?: string; error?: string });
    setReading(false);
    if (result.text) {
      setText((t) => (t.trim() ? `${t.trim()}\n\n${result.text}` : result.text!));
      setTab("write");
    } else setReadError(result.error ?? "No se pudo leer la foto.");
  }

  return (
    <form action={formAction} className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-4">
        <div role="tablist" className="flex gap-1 border-b border-line">
          {[
            { key: "write", label: "Escribir o pegar" },
            { key: "dictate", label: "Dictar" },
            { key: "photo", label: "Desde una foto" },
          ].map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key as typeof tab)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-accent font-bold text-accent" : "border-transparent text-muted"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === "dictate" && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-sunk p-3 text-sm">
            <DictateButton onText={(t) => setText((prev) => `${prev.trim()} ${t}`.trim())} />
            <span className="text-muted">Lo que dictes se agrega al texto. Funciona en Chrome, Edge y Android.</span>
          </div>
        )}
        {tab === "photo" && (
          <div className="flex flex-col gap-2 rounded-lg bg-sunk p-3 text-sm">
            <input ref={photos} type="file" accept="image/*,application/pdf" multiple className="text-sm" aria-label="Fotos del texto" />
            <button type="button" onClick={readPhotos} disabled={reading} className="min-h-10 self-start rounded-lg border border-line bg-paper px-3 font-bold disabled:opacity-60">
              {reading ? "Leyendo la foto…" : "Leer el texto de la foto"}
            </button>
            {readError && <span className="text-bad">{readError}</span>}
            <span className="text-muted">Hasta 3 fotos. El texto leído aparece abajo para que lo revises.</span>
          </div>
        )}
        <textarea
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          minLength={80}
          maxLength={20000}
          placeholder="Pegá o escribí el texto del tema. Las preguntas se generan solo a partir de este texto."
          className={`${inputClass} min-h-72 py-2`}
        />
        <span className="text-xs text-muted tabular-nums">{text.length} caracteres · mínimo 80</span>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-4">
        <h2 className="font-display font-semibold">¿Qué tarea querés generar?</h2>
        {state?.error && <Notice tone="bad">{state.error}</Notice>}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-muted">Materia</span>
          <select name="subjectId" required defaultValue={initialSubjectId ?? ""} className={inputClass}>
            <option value="" disabled>
              Elegí la materia
            </option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 text-sm font-bold text-muted">Tipo</legend>
          {(Object.keys(taskTypeLabels) as TaskTypeName[]).map((t) => (
            <label key={t} className="cursor-pointer">
              <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="peer sr-only" />
              <span className="inline-flex min-h-10 items-center rounded-full border border-line px-3 text-sm peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-bold peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent">{taskTypeLabels[t]}</span>
            </label>
          ))}
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-muted">{itemsLabel[type]}</span>
            <input type="number" name="questions" min={1} max={15} defaultValue={5} required className={inputClass} />
          </label>
          {elementsLabel[type] && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-bold text-muted">{elementsLabel[type]}</span>
              <input type="number" name="elements" min={2} max={10} defaultValue={type === "FILL_BLANKS" ? 2 : 4} required className={inputClass} key={type} />
            </label>
          )}
          {type === "MULTIPLE_CHOICE" && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-bold text-muted">Correctas por pregunta</span>
              <input type="number" name="correctPerItem" min={1} max={5} defaultValue={1} className={inputClass} />
            </label>
          )}
          {type === "MATCHING" && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-bold text-muted">Distractores</span>
              <input type="number" name="distractors" min={0} max={4} defaultValue={1} className={inputClass} />
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-muted">Nivel</span>
            <input name="level" placeholder="Por ejemplo, 5° grado" maxLength={40} className={inputClass} />
          </label>
        </div>
        {type === "TRUE_FALSE" && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="justification" className="size-4" /> Pedir justificación en cada afirmación
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" name="simpleLanguage" defaultChecked className="size-4" /> Lenguaje simple y oraciones cortas
        </label>
        <p className="text-xs text-muted">La inteligencia artificial solo recibe el texto. Siempre vas a poder revisar y corregir todo antes de asignar.</p>
        <Submit />
      </section>
    </form>
  );
}
