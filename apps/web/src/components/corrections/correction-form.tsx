"use client";

import { suggestedGrade } from "@fertelligence/core";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/components/action-form";
import { Notice, Pill } from "@/components/ui";

export type CorrectionItem = { id: string; index: number; maxPoints: number; autoPoints: number; carriedOver: boolean; needsReview: boolean };

const inputClass = "min-h-10 rounded-lg border border-line bg-paper px-3 text-ink";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-accent px-5 font-bold text-accent-ink disabled:opacity-60">
      {pending ? "Aprobando…" : "Aprobar corrección"}
    </button>
  );
}

// Corrección de una entrega: puntaje por ítem, nota sugerida en vivo (siempre editable),
// desaprobar por atraso y, si queda desaprobada, decidir si la rehace.
export function CorrectionForm({
  items,
  renders,
  passGrade,
  late,
  lateDays,
  defaultRedoDue,
  approve,
}: {
  items: CorrectionItem[];
  renders: React.ReactNode[];
  passGrade: number;
  late: boolean;
  lateDays: number;
  defaultRedoDue: string;
  approve: (state: ActionState, form: FormData) => Promise<ActionState>;
}) {
  const [state, action] = useActionState(approve, null);
  const [points, setPoints] = useState<Record<string, number>>(() => Object.fromEntries(items.map((i) => [i.id, i.autoPoints])));
  const [override, setOverride] = useState<string>("");
  const [failForLate, setFailForLate] = useState(false);
  const [redo, setRedo] = useState(false);

  const suggested = useMemo(() => suggestedGrade(items.map((i) => ({ points: Number(points[i.id] ?? 0), maxPoints: i.maxPoints }))), [items, points]);
  const obtained = items.reduce((s, i) => s + Number(points[i.id] ?? 0), 0);
  const total = items.reduce((s, i) => s + i.maxPoints, 0);
  const grade = override === "" ? suggested : Number(override);
  const passed = grade >= passGrade && !failForLate;

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <div className="flex min-w-0 flex-col gap-3">
        {items.map((item, i) => (
          <section key={item.id} className={`rounded-xl border bg-paper p-4 ${item.needsReview ? "border-accent" : "border-line"}`}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <b>Ítem {item.index + 1}</b>
              {item.needsReview && <Pill tone="accent">Revisar justificación</Pill>}
              {item.carriedOver && <Pill tone="ok">Venía bien del intento anterior</Pill>}
              <span className="flex-1" />
              <label className="flex items-center gap-2 text-sm">
                Puntaje
                <input
                  type="number"
                  name={`points:${item.id}`}
                  min={0}
                  max={item.maxPoints}
                  step={0.25}
                  value={points[item.id]}
                  disabled={item.carriedOver}
                  onChange={(e) => setPoints((p) => ({ ...p, [item.id]: Math.min(item.maxPoints, Math.max(0, Number(e.target.value))) }))}
                  className={`${inputClass} w-20 text-right tabular-nums`}
                />
                <span className="text-muted tabular-nums">/ {item.maxPoints}</span>
              </label>
            </div>
            {renders[i]}
            {item.autoPoints !== points[item.id] && !item.carriedOver && <p className="mt-2 text-xs text-muted">Sugerido: {item.autoPoints}. Lo cambiaste.</p>}
            <input name={`comment:${item.id}`} placeholder="Comentario para el alumno sobre este ítem (opcional)" maxLength={1000} className={`${inputClass} mt-3 w-full`} />
          </section>
        ))}
      </div>

      <aside className="flex flex-col gap-4 self-start rounded-xl border border-line bg-paper p-4 lg:sticky lg:top-4">
        {state?.error && <Notice tone="bad">{state.error}</Notice>}
        {late && <Notice tone="bad">Entregada fuera de término: {lateDays === 1 ? "1 día" : `${lateDays} días`} de atraso.</Notice>}
        <div>
          <span className="text-sm font-bold text-muted">Nota final</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              name="grade"
              min={0}
              max={10}
              step={1}
              value={override === "" ? suggested : override}
              onChange={(e) => setOverride(e.target.value === String(suggested) ? "" : e.target.value)}
              className={`${inputClass} w-24 font-display text-3xl font-semibold tabular-nums`}
              aria-label="Nota final"
            />
            <span className="text-muted">/ 10</span>
            {override !== "" && (
              <button type="button" onClick={() => setOverride("")} className="ml-auto text-sm text-accent underline">
                Usar la sugerida
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">
            Sugerida: {suggested} ({obtained} de {total} puntos). Podés cambiarla. Aprueba con {passGrade}.
          </p>
          {override === "" && <input type="hidden" name="useSuggested" value="1" />}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold text-muted">Resultado</legend>
          <label className={`flex items-center gap-2 rounded-lg border p-2 ${!failForLate ? "border-accent bg-accent-soft" : "border-line"}`}>
            <input type="radio" checked={!failForLate} onChange={() => setFailForLate(false)} />
            Según la nota: <b>{grade >= passGrade ? "Aprobada" : "Desaprobada"}</b>
          </label>
          {late && (
            <label className={`flex items-center gap-2 rounded-lg border p-2 ${failForLate ? "border-bad bg-bad-soft" : "border-line"}`}>
              <input type="radio" checked={failForLate} onChange={() => setFailForLate(true)} />
              Desaprobar por entrega fuera de término
            </label>
          )}
          <input type="hidden" name="failForLate" value={failForLate ? "1" : ""} />
          {failForLate && <input name="reason" required placeholder="Motivo (lo ve el alumno)" maxLength={500} className={inputClass} />}
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-muted">Comentario general (opcional)</span>
          <textarea name="comment" maxLength={2000} className={`${inputClass} min-h-24 py-2`} />
        </label>

        <fieldset disabled={passed} className={`flex flex-col gap-2 rounded-lg border border-line p-3 ${passed ? "opacity-50" : ""}`}>
          <legend className="px-1 text-sm font-bold text-muted">Si queda desaprobada</legend>
          <label className="flex items-center gap-2">
            <input type="radio" checked={!redo || passed} onChange={() => setRedo(false)} />
            Queda desaprobada
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={redo && !passed} onChange={() => setRedo(true)} />
            Debe rehacerla
          </label>
          {redo && !passed && (
            <label className="flex flex-col gap-1 text-sm">
              Nueva fecha de entrega
              <input type="datetime-local" name="redoDueAt" defaultValue={defaultRedoDue} required className={inputClass} />
            </label>
          )}
          <input type="hidden" name="redo" value={redo && !passed ? "1" : ""} />
          {passed && <span className="text-xs text-muted">Se habilita cuando el resultado es Desaprobada.</span>}
        </fieldset>

        <div className="rounded-lg bg-sunk p-3 text-sm">
          Al aprobar, el alumno ve su nota <b>{grade}</b> ({passed ? "Aprobada" : "Desaprobada"}){redo && !passed ? " y tiene que rehacerla" : ""}. Le avisamos por email.
        </div>
        <Submit />
      </aside>
    </form>
  );
}
