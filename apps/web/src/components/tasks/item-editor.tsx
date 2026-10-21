"use client";

import { emptyItem, itemProblem, parseBlanksMarkup, splitBlanks, toBlanksMarkup, type EditorItem, type TaskTypeName } from "@fertelligence/core";
import { useState, useTransition } from "react";
import { Button, Notice } from "@/components/ui";
import { ImageField, type UploadAction } from "./image-field";

// Editor de los ítems de una tarea. Mantiene todo en el navegador y guarda de una vez.

type Opt = { id: string; text: string; imageFileId?: string };
type MC = { question: string; multiple: boolean; options: Opt[] };
type TF = { statement: string; requireJustification: boolean; justificationPoints: number };
type Match = { left: Opt[]; right: Opt[] };
type Fill = { text: string; blanks: { id: string }[]; wordBank?: string[]; requireAccents: boolean };
type Strike = { topicText: string; phrases: Opt[] };

const newId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}`;
const inputClass = "block w-full min-h-10 rounded-lg border border-line bg-paper px-3 text-ink placeholder:text-muted";
const areaClass = `${inputClass} min-h-20 py-2`;
const smallBtn = "min-h-9 rounded-md border border-line px-2.5 text-sm text-ink hover:border-muted disabled:opacity-40";

type SaveAction = (itemsJson: string) => Promise<{ error?: string; success?: string }>;

export function ItemEditor({ type, initialItems, save, upload, readOnly }: { type: TaskTypeName; initialItems: EditorItem[]; save: SaveAction; upload: UploadAction; readOnly?: boolean }) {
  const [items, setItems] = useState<EditorItem[]>(initialItems.length ? initialItems : [emptyItem(type)]);
  const [message, setMessage] = useState<{ error?: string; success?: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  const update = (index: number, next: Partial<EditorItem>) => {
    setItems((all) => all.map((item, i) => (i === index ? { ...item, ...next } : item)));
    setDirty(true);
    setMessage(null);
  };
  const move = (index: number, delta: number) => {
    setItems((all) => {
      const copy = [...all];
      const [moved] = copy.splice(index, 1);
      copy.splice(index + delta, 0, moved!);
      return copy;
    });
    setDirty(true);
  };
  const remove = (index: number) => {
    setItems((all) => all.filter((_, i) => i !== index));
    setDirty(true);
  };
  const duplicate = (index: number) => {
    setItems((all) => [...all.slice(0, index + 1), structuredClone(all[index]!), ...all.slice(index + 1)]);
    setDirty(true);
  };
  const add = () => {
    setItems((all) => [...all, emptyItem(type)]);
    setDirty(true);
  };

  const total = items.reduce((sum, i) => sum + (Number(i.maxPoints) || 0), 0);
  const problems = items.map((item) => itemProblem(type, item));

  function onSave() {
    startTransition(async () => {
      const result = await save(JSON.stringify(items));
      setMessage(result);
      if (!result.error) setDirty(false);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {readOnly && <Notice tone="warn">Algún alumno ya empezó esta tarea, así que no se puede editar. Duplicala para hacer cambios.</Notice>}
      <fieldset disabled={readOnly} className="flex flex-col gap-4">
        {items.map((item, index) => (
          <section key={index} className="rounded-xl border border-line bg-paper p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="font-display font-semibold">Ítem {index + 1}</h3>
              {problems[index] ? <span className="text-sm text-warn">{problems[index]}</span> : <span className="text-sm text-ok">Completo</span>}
              <span className="flex-1" />
              <button type="button" className={smallBtn} onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Subir ítem ${index + 1}`}>
                ↑
              </button>
              <button type="button" className={smallBtn} onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={`Bajar ítem ${index + 1}`}>
                ↓
              </button>
              <button type="button" className={smallBtn} onClick={() => duplicate(index)}>
                Duplicar
              </button>
              <button type="button" className={`${smallBtn} text-bad`} onClick={() => remove(index)} disabled={items.length === 1}>
                Eliminar
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {type === "MULTIPLE_CHOICE" && <MultipleChoiceFields item={item} onChange={(n) => update(index, n)} upload={upload} />}
              {type === "TRUE_FALSE" && <TrueFalseFields item={item} onChange={(n) => update(index, n)} />}
              {type === "MATCHING" && <MatchingFields item={item} onChange={(n) => update(index, n)} />}
              {type === "FILL_BLANKS" && <FillBlanksFields item={item} onChange={(n) => update(index, n)} />}
              {type === "STRIKE_OUT" && <StrikeOutFields item={item} onChange={(n) => update(index, n)} />}

              <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-[140px_1fr]">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-bold text-muted">Puntaje</span>
                  <input type="number" min={0.25} step={0.25} className={inputClass} value={item.maxPoints} onChange={(e) => update(index, { maxPoints: Number(e.target.value) })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-bold text-muted">Explicación (la ve el alumno después de la corrección)</span>
                  <input className={inputClass} value={item.explanation ?? ""} maxLength={2000} onChange={(e) => update(index, { explanation: e.target.value })} />
                </label>
              </div>
              <ImageField label="Imagen del ítem" value={item.imageFileId} onChange={(id) => update(index, { imageFileId: id })} upload={upload} />
            </div>
          </section>
        ))}
      </fieldset>

      {!readOnly && (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper/95 p-3 backdrop-blur">
          <Button type="button" onClick={add}>
            + Agregar ítem
          </Button>
          <span className="text-sm text-muted tabular-nums">
            {items.length} {items.length === 1 ? "ítem" : "ítems"} · {total} puntos · la nota se calcula sobre 10
          </span>
          <span className="flex-1" />
          {message?.error && <span className="text-sm text-bad">{message.error}</span>}
          {message?.success && !dirty && <span className="text-sm text-ok">{message.success}</span>}
          <Button type="button" variant="primary" onClick={onSave} disabled={pending}>
            {pending ? "Guardando…" : "Guardar ítems"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------- Múltiple choice ----------

function MultipleChoiceFields({ item, onChange, upload }: { item: EditorItem; onChange: (n: Partial<EditorItem>) => void; upload: UploadAction }) {
  const c = item.content as MC;
  const correct = new Set((item.correct as { optionIds: string[] }).optionIds);
  const set = (content: MC, optionIds = [...correct]) => onChange({ content, correct: { optionIds: optionIds.filter((id) => content.options.some((o) => o.id === id)) } });
  const toggleCorrect = (id: string) => {
    if (c.multiple) set(c, correct.has(id) ? [...correct].filter((x) => x !== id) : [...correct, id]);
    else set(c, [id]);
  };
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold text-muted">Pregunta</span>
        <textarea className={areaClass} value={c.question} onChange={(e) => set({ ...c, question: e.target.value })} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={c.multiple} onChange={(e) => set({ ...c, multiple: e.target.checked }, e.target.checked ? [...correct] : [...correct].slice(0, 1))} className="size-4" />
        Varias respuestas correctas (con puntaje parcial)
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold text-muted">Opciones · marcá {c.multiple ? "las correctas" : "la correcta"}</legend>
        {c.options.map((o, i) => (
          <div key={o.id} className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${correct.has(o.id) ? "border-ok bg-ok-soft" : "border-line"}`}>
            <input type={c.multiple ? "checkbox" : "radio"} checked={correct.has(o.id)} onChange={() => toggleCorrect(o.id)} className="size-5" aria-label={`Opción ${i + 1} correcta`} name={`correct-${c.options[0]?.id}`} />
            <input className={`${inputClass} min-w-40 flex-1`} value={o.text} placeholder={`Opción ${i + 1}`} onChange={(e) => set({ ...c, options: c.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })} />
            <ImageField label="Imagen" value={o.imageFileId} upload={upload} onChange={(id) => set({ ...c, options: c.options.map((x) => (x.id === o.id ? { ...x, imageFileId: id ?? undefined } : x)) })} />
            <button type="button" className={smallBtn} disabled={c.options.length <= 2} onClick={() => set({ ...c, options: c.options.filter((x) => x.id !== o.id) })} aria-label={`Quitar opción ${i + 1}`}>
              ✕
            </button>
          </div>
        ))}
        {c.options.length < 8 && (
          <button type="button" className={`${smallBtn} self-start`} onClick={() => set({ ...c, options: [...c.options, { id: newId("o"), text: "" }] })}>
            + Opción
          </button>
        )}
      </fieldset>
    </>
  );
}

// ---------- Verdadero o falso ----------

function TrueFalseFields({ item, onChange }: { item: EditorItem; onChange: (n: Partial<EditorItem>) => void }) {
  const c = item.content as TF;
  const k = item.correct as { value: boolean; expectedJustification?: string };
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold text-muted">Afirmación</span>
        <textarea className={areaClass} value={c.statement} onChange={(e) => onChange({ content: { ...c, statement: e.target.value } })} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-muted">Respuesta correcta:</span>
        {[true, false].map((value) => (
          <button
            key={String(value)}
            type="button"
            onClick={() => onChange({ correct: { ...k, value } })}
            aria-pressed={k.value === value}
            className={`min-h-10 rounded-full border px-4 text-sm font-bold ${k.value === value ? "border-accent bg-accent-soft text-accent" : "border-line text-ink"}`}
          >
            {value ? "Verdadero" : "Falso"}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={c.requireJustification} onChange={(e) => onChange({ content: { ...c, requireJustification: e.target.checked, justificationPoints: e.target.checked ? c.justificationPoints || Math.max(0.5, Math.floor(item.maxPoints / 2)) : 0 } })} className="size-4" />
        Pedir que justifique la respuesta
      </label>
      {c.requireJustification && (
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-muted">Puntos de la justificación</span>
            <input type="number" min={0.25} step={0.25} className={inputClass} value={c.justificationPoints} onChange={(e) => onChange({ content: { ...c, justificationPoints: Number(e.target.value) } })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-muted">Justificación esperada (guía para corregir)</span>
            <input className={inputClass} value={k.expectedJustification ?? ""} onChange={(e) => onChange({ correct: { ...k, expectedJustification: e.target.value } })} />
          </label>
        </div>
      )}
    </>
  );
}

// ---------- Unir con flechas ----------

function MatchingFields({ item, onChange }: { item: EditorItem; onChange: (n: Partial<EditorItem>) => void }) {
  const c = item.content as Match;
  const pairs = (item.correct as { pairs: [string, string][] }).pairs;
  const rightById = new Map(c.right.map((r) => [r.id, r]));
  const rows = c.left.map((l) => ({ left: l, right: rightById.get(pairs.find(([lid]) => lid === l.id)?.[1] ?? "") ?? { id: newId("r"), text: "" } }));
  const paired = new Set(rows.map((r) => r.right.id));
  const distractors = c.right.filter((r) => !paired.has(r.id));

  const commit = (nextRows: typeof rows, nextDistractors: Opt[]) =>
    onChange({
      content: { left: nextRows.map((r) => r.left), right: [...nextRows.map((r) => r.right), ...nextDistractors] },
      correct: { pairs: nextRows.map((r) => [r.left.id, r.right.id]) },
    });

  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold text-muted">Parejas correctas · al alumno se le muestran desordenadas</legend>
        {rows.map((row, i) => (
          <div key={row.left.id} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
            <input className={inputClass} value={row.left.text} placeholder={`Elemento ${i + 1}`} aria-label={`Columna A, fila ${i + 1}`} onChange={(e) => commit(rows.map((r) => (r === row ? { ...r, left: { ...r.left, text: e.target.value } } : r)), distractors)} />
            <span className="text-muted" aria-hidden="true">
              →
            </span>
            <input className={inputClass} value={row.right.text} placeholder="Su pareja" aria-label={`Columna B, fila ${i + 1}`} onChange={(e) => commit(rows.map((r) => (r === row ? { ...r, right: { ...r.right, text: e.target.value } } : r)), distractors)} />
            <button type="button" className={smallBtn} disabled={rows.length <= 2} onClick={() => commit(rows.filter((r) => r !== row), distractors)} aria-label={`Quitar fila ${i + 1}`}>
              ✕
            </button>
          </div>
        ))}
        {rows.length < 10 && (
          <button type="button" className={`${smallBtn} self-start`} onClick={() => commit([...rows, { left: { id: newId("l"), text: "" }, right: { id: newId("r"), text: "" } }], distractors)}>
            + Pareja
          </button>
        )}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold text-muted">Distractores en la columna B (opcional, sin pareja)</legend>
        {distractors.map((d) => (
          <div key={d.id} className="flex items-center gap-2">
            <input className={inputClass} value={d.text} onChange={(e) => commit(rows, distractors.map((x) => (x.id === d.id ? { ...x, text: e.target.value } : x)))} aria-label="Distractor" />
            <button type="button" className={smallBtn} onClick={() => commit(rows, distractors.filter((x) => x.id !== d.id))} aria-label="Quitar distractor">
              ✕
            </button>
          </div>
        ))}
        {distractors.length < 4 && (
          <button type="button" className={`${smallBtn} self-start`} onClick={() => commit(rows, [...distractors, { id: newId("r"), text: "" }])}>
            + Distractor
          </button>
        )}
      </fieldset>
    </>
  );
}

// ---------- Completar ----------

function FillBlanksFields({ item, onChange }: { item: EditorItem; onChange: (n: Partial<EditorItem>) => void }) {
  const c = item.content as Fill;
  const answers = (item.correct as { answers: Record<string, string[]> }).answers;
  const [markup, setMarkup] = useState(() => toBlanksMarkup(c.text, answers));
  const firstAnswers = c.blanks.map((b) => answers[b.id]?.[0]).filter(Boolean) as string[];
  const extraWords = (c.wordBank ?? []).filter((w) => !firstAnswers.includes(w));

  const apply = (nextMarkup: string, bank: boolean, extras: string[], requireAccents: boolean) => {
    const parsed = parseBlanksMarkup(nextMarkup);
    const firsts = parsed.blanks.map((b) => parsed.answers[b.id]?.[0]).filter(Boolean) as string[];
    onChange({
      content: { text: parsed.text, blanks: parsed.blanks, requireAccents, ...(bank ? { wordBank: [...firsts, ...extras] } : {}) },
      correct: { answers: parsed.answers },
    });
  };

  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold text-muted">Texto · poné entre corchetes dobles lo que el alumno tiene que completar</span>
        <textarea
          className={`${areaClass} font-mono text-sm`}
          value={markup}
          placeholder="Cuando el agua se calienta pasa a estado [[gaseoso]]. Ese proceso se llama [[evaporación|vaporización]]."
          onChange={(e) => {
            setMarkup(e.target.value);
            apply(e.target.value, Boolean(c.wordBank), extraWords, c.requireAccents);
          }}
        />
        <span className="text-xs text-muted">Si hay varias respuestas válidas, separalas con una barra: [[evaporación|vaporización]].</span>
      </label>
      {c.blanks.length > 0 && (
        <p className="rounded-lg bg-sunk p-3 leading-8">
          {splitBlanks(c.text).map((part, i) =>
            part.kind === "text" ? (
              <span key={i}>{part.value}</span>
            ) : (
              <span key={i} className="mx-1 inline-block min-w-16 border-b-2 border-accent px-1 text-center text-sm font-bold text-accent">
                {answers[part.id]?.join(" / ")}
              </span>
            ),
          )}
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(c.wordBank)} onChange={(e) => apply(markup, e.target.checked, extraWords, c.requireAccents)} className="size-4" />
        Mostrar un banco de palabras para elegir
      </label>
      {c.wordBank && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-muted">Palabras extra para el banco (separadas por coma)</span>
          <input className={inputClass} defaultValue={extraWords.join(", ")} onBlur={(e) => apply(markup, true, e.target.value.split(",").map((w) => w.trim()).filter(Boolean), c.requireAccents)} />
        </label>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={c.requireAccents} onChange={(e) => apply(markup, Boolean(c.wordBank), extraWords, e.target.checked)} className="size-4" />
        Exigir tildes (si no, &quot;evaporacion&quot; cuenta como correcta)
      </label>
    </>
  );
}

// ---------- Tachar lo que no corresponde ----------

function StrikeOutFields({ item, onChange }: { item: EditorItem; onChange: (n: Partial<EditorItem>) => void }) {
  const c = item.content as Strike;
  const strike = new Set((item.correct as { strikeIds: string[] }).strikeIds);
  const commit = (content: Strike, ids = [...strike]) => onChange({ content, correct: { strikeIds: ids.filter((id) => content.phrases.some((p) => p.id === id)) } });
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold text-muted">Texto del tema</span>
        <textarea className={areaClass} value={c.topicText} onChange={(e) => commit({ ...c, topicText: e.target.value })} />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold text-muted">Frases · marcá las que NO corresponden (las que el alumno tiene que tachar)</legend>
        {c.phrases.map((p, i) => (
          <div key={p.id} className={`flex items-center gap-2 rounded-lg border p-2 ${strike.has(p.id) ? "border-bad bg-bad-soft" : "border-line"}`}>
            <label className="flex shrink-0 items-center gap-1 text-sm">
              <input type="checkbox" checked={strike.has(p.id)} onChange={() => commit(c, strike.has(p.id) ? [...strike].filter((x) => x !== p.id) : [...strike, p.id])} className="size-5" />
              Tachar
            </label>
            <input className={inputClass} value={p.text} placeholder={`Frase ${i + 1}`} onChange={(e) => commit({ ...c, phrases: c.phrases.map((x) => (x.id === p.id ? { ...x, text: e.target.value } : x)) })} />
            <button type="button" className={smallBtn} disabled={c.phrases.length <= 2} onClick={() => commit({ ...c, phrases: c.phrases.filter((x) => x.id !== p.id) })} aria-label={`Quitar frase ${i + 1}`}>
              ✕
            </button>
          </div>
        ))}
        {c.phrases.length < 12 && (
          <button type="button" className={`${smallBtn} self-start`} onClick={() => commit({ ...c, phrases: [...c.phrases, { id: newId("p"), text: "" }] })}>
            + Frase
          </button>
        )}
      </fieldset>
    </>
  );
}
