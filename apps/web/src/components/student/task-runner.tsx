"use client";

import { splitBlanks, type TaskTypeName } from "@fertelligence/core";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { seededShuffle } from "@/components/tasks/task-render";
import { DictateButton, ListenButton, speak, stopSpeaking } from "./speech";

// Modo foco: una consigna por pantalla, opciones grandes, progreso visible y guardado automático.

type Opt = { id: string; text: string; imageFileId?: string };
export type RunnerItem = { id: string; content: Record<string, unknown>; imageFileId: string | null; carriedOver: boolean; response: unknown };
export type RunnerPrefs = { fontSize: "normal" | "large" | "xlarge"; autoRead: boolean; pauseReminders: boolean; showTimer: boolean; reduceMotion: boolean };

type Props = {
  taskId: string;
  title: string;
  instructions: string;
  type: TaskTypeName;
  items: RunnerItem[];
  seed: string;
  shuffle: boolean;
  overdue: boolean;
  prefs: RunnerPrefs;
  save: (taskId: string, itemId: string, json: string) => Promise<{ ok: boolean; error?: string }>;
  submit: (taskId: string) => Promise<{ error?: string }>;
};

type SaveState = "idle" | "saving" | "saved" | "error";
const fontSizes = { normal: "text-[17px]", large: "text-[19px]", xlarge: "text-[22px]" };
const letters = "ABCDEFGHIJ";
const PAUSE_MS = 10 * 60 * 1000;

function answered(type: TaskTypeName, item: RunnerItem, response: unknown): boolean {
  if (item.carriedOver) return true;
  if (response === null || response === undefined) return false;
  const r = response as Record<string, unknown>;
  if (type === "MULTIPLE_CHOICE") return Array.isArray(r.optionIds) && r.optionIds.length > 0;
  if (type === "TRUE_FALSE") return typeof r.value === "boolean";
  if (type === "MATCHING") return Array.isArray(r.pairs) && r.pairs.length === (item.content.left as unknown[]).length;
  if (type === "FILL_BLANKS") return (item.content.blanks as { id: string }[]).every((b) => String((r.answers as Record<string, string>)?.[b.id] ?? "").trim() !== "");
  return Array.isArray(r.strikeIds);
}

function itemSummary(type: TaskTypeName, item: RunnerItem): string {
  const c = item.content;
  if (type === "MULTIPLE_CHOICE") return String(c.question);
  if (type === "TRUE_FALSE") return String(c.statement);
  if (type === "MATCHING") return "Unir con flechas";
  if (type === "FILL_BLANKS") return splitBlanks(String(c.text)).map((p) => (p.kind === "text" ? p.value : "…")).join("");
  return String(c.topicText).slice(0, 80);
}

function readAloudText(type: TaskTypeName, item: RunnerItem): string {
  const c = item.content;
  if (type === "MULTIPLE_CHOICE") return `${c.question}. ${(c.options as Opt[]).map((o, i) => `${letters[i]}: ${o.text}`).join(". ")}`;
  if (type === "TRUE_FALSE") return `${c.statement}. ¿Verdadero o falso?`;
  if (type === "MATCHING") return `Uní cada elemento con su pareja. ${(c.left as Opt[]).map((o) => o.text).join(", ")}.`;
  if (type === "FILL_BLANKS") return splitBlanks(String(c.text)).map((p) => (p.kind === "text" ? p.value : " espacio en blanco ")).join("");
  return `${c.topicText}. Tachá las frases que no corresponden: ${(c.phrases as Opt[]).map((p) => p.text).join(". ")}`;
}

export function TaskRunner(props: Props) {
  const { taskId, type, items, prefs } = props;
  const [index, setIndex] = useState(() => {
    const first = items.findIndex((i) => !answered(type, i, i.response));
    return first === -1 ? items.length : first;
  });
  const [responses, setResponses] = useState<Record<string, unknown>>(() => Object.fromEntries(items.map((i) => [i.id, i.response])));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingSaves = useRef<Record<string, string>>({});
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [pauseDismissedAt, setPauseDismissedAt] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const flush = useCallback(
    async (itemId: string) => {
      const json = pendingSaves.current[itemId];
      if (json === undefined) return true;
      setSaveState("saving");
      const result = await props.save(taskId, itemId, json).catch(() => ({ ok: false, error: "Sin conexión." }));
      if (result.ok) {
        if (pendingSaves.current[itemId] === json) delete pendingSaves.current[itemId];
        setSaveState(Object.keys(pendingSaves.current).length ? "saving" : "saved");
        setSaveError(null);
        return true;
      }
      setSaveState("error");
      setSaveError(result.error ?? "No se pudo guardar.");
      timers.current[itemId] = setTimeout(() => void flush(itemId), 4000); // reintento
      return false;
    },
    [props, taskId],
  );

  // latest: la respuesta más reciente de cada ítem, aunque React todavía no haya vuelto a dibujar
  // (dos toques seguidos no deben pisarse).
  const latest = useRef<Record<string, unknown>>(responses);
  const setResponse = (itemId: string, valueOrUpdate: unknown | ((prev: unknown) => unknown)) => {
    const value = typeof valueOrUpdate === "function" ? (valueOrUpdate as (prev: unknown) => unknown)(latest.current[itemId]) : valueOrUpdate;
    latest.current = { ...latest.current, [itemId]: value };
    setResponses(latest.current);
    pendingSaves.current[itemId] = JSON.stringify(value);
    clearTimeout(timers.current[itemId]);
    timers.current[itemId] = setTimeout(() => void flush(itemId), 500);
  };

  const flushAll = async () => {
    for (const id of Object.keys(pendingSaves.current)) {
      clearTimeout(timers.current[id]);
      await flush(id);
    }
    return Object.keys(pendingSaves.current).length === 0;
  };

  const item = items[index];

  useEffect(() => {
    if (prefs.autoRead && item) speak(readAloudText(type, item));
    return () => stopSpeaking();
  }, [index, prefs.autoRead, item, type]);

  const goTo = (next: number) => {
    // "Tachar": pasar de pantalla sin tachar nada también es una respuesta
    if (item && type === "STRIKE_OUT" && !item.carriedOver && (responses[item.id] === null || responses[item.id] === undefined) && next > index) setResponse(item.id, { strikeIds: [] });
    setIndex(Math.max(0, Math.min(items.length, next)));
    window.scrollTo({ top: 0, behavior: prefs.reduceMotion ? "auto" : "smooth" });
  };

  const doneCount = items.filter((i) => answered(type, i, responses[i.id])).length;
  const showPause = prefs.pauseReminders && now - Math.max(startedAt, pauseDismissedAt) > PAUSE_MS;
  const minutes = Math.floor((now - startedAt) / 60000);

  return (
    <div className={`mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 pt-4 pb-6 ${fontSizes[prefs.fontSize]}`} style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
      <header className="flex items-center gap-3 text-sm text-muted">
        <Link href={`/alumno/tareas/${taskId}`} onClick={() => void flushAll()} className="grid size-10 place-items-center rounded-full border border-line bg-paper text-ink no-underline" aria-label="Salir (se guarda lo que hiciste)">
          ✕
        </Link>
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {items.map((it, i) => (
            <span key={it.id} className={`h-2 flex-1 rounded-full ${i === index ? "bg-accent" : answered(type, it, responses[it.id]) ? "bg-ok" : "bg-line"}`} />
          ))}
        </div>
        <span className="tabular-nums">{index < items.length ? `${index + 1} de ${items.length}` : "Revisar"}</span>
      </header>

      {showPause && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-sun bg-sun-soft p-3 text-base">
          <span className="flex-1">Llevás un rato concentrado. ¿Te tomás una pausa de 2 minutos? Lo que hiciste ya está guardado.</span>
          <button type="button" onClick={() => setPauseDismissedAt(Date.now())} className="min-h-10 rounded-lg border border-line bg-paper px-3 font-bold">
            Sigo
          </button>
        </div>
      )}

      {item ? (
        <main className="flex flex-1 flex-col gap-4">
          {item.imageFileId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/archivos/${item.imageFileId}`} alt="" className="max-h-64 w-full rounded-xl border border-line bg-paper object-contain" />
          )}
          {item.carriedOver ? (
            <div className="rounded-xl border border-ok bg-ok-soft p-4">
              <p className="font-display text-lg">{itemSummary(type, item)}</p>
              <p className="mt-2 font-bold">Esta ya estaba bien en tu intento anterior. No hace falta que la rehagas.</p>
            </div>
          ) : (
            <ItemInput type={type} item={item} response={responses[item.id]} onChange={(v) => setResponse(item.id, v)} shuffle={props.shuffle} seed={props.seed} />
          )}
        </main>
      ) : (
        <Review {...props} responses={responses} onGo={goTo} doneCount={doneCount} flushAll={flushAll} />
      )}

      <footer className="sticky bottom-0 flex items-center gap-3 bg-bg pt-2" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        <button type="button" onClick={() => goTo(index - 1)} disabled={index === 0} className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-line bg-paper text-lg font-bold disabled:opacity-40" aria-label="Anterior">
          ‹
        </button>
        <span className="flex-1 text-center text-xs text-muted" role="status" aria-live="polite">
          {saveState === "saving" ? "Guardando…" : saveState === "error" ? (saveError ?? "No se pudo guardar. Reintentando…") : saveState === "saved" ? "Guardado" : ""}
          {prefs.showTimer && ` · ${minutes} min`}
        </span>
        {item && (
          <button type="button" onClick={() => goTo(index + 1)} className="min-h-12 flex-[2] rounded-xl bg-accent px-5 text-lg font-bold text-accent-ink">
            {index === items.length - 1 ? "Revisar" : "Siguiente"}
          </button>
        )}
      </footer>
    </div>
  );
}

// ---------- Un ítem ----------

function ItemInput({ type, item, response, onChange, shuffle, seed }: { type: TaskTypeName; item: RunnerItem; response: unknown; onChange: (v: unknown) => void; shuffle: boolean; seed: string }) {
  const order = useCallback(<T,>(list: T[]) => (shuffle ? seededShuffle(list, `${seed}:${item.id}`) : list), [shuffle, seed, item.id]);
  const listen = <ListenButton text={readAloudText(type, item)} />;
  const c = item.content;

  if (type === "MULTIPLE_CHOICE") {
    const chosen = new Set((response as { optionIds?: string[] } | null)?.optionIds ?? []);
    const multiple = Boolean(c.multiple);
    const options = order(c.options as Opt[]);
    const toggle = (id: string) =>
      onChange((prev: unknown) => {
        const current = new Set((prev as { optionIds?: string[] } | null)?.optionIds ?? []);
        return { optionIds: multiple ? (current.has(id) ? [...current].filter((x) => x !== id) : [...current, id]) : [id] };
      });
    return (
      <>
        <p className="font-display text-[1.4em] leading-snug font-medium">{String(c.question)}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {listen}
          <span>{multiple ? "Podés elegir más de una." : "Elegí una."}</span>
        </div>
        <div className="flex flex-col gap-3" role={multiple ? "group" : "radiogroup"}>
          {options.map((o, i) => {
            const on = chosen.has(o.id);
            return (
              <button key={o.id} type="button" role={multiple ? "checkbox" : "radio"} aria-checked={on} onClick={() => toggle(o.id)} className={`flex items-center gap-4 rounded-2xl border-2 px-4 py-3.5 text-left ${on ? "border-accent bg-accent-soft" : "border-line bg-paper"}`}>
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg font-display font-semibold ${on ? "bg-accent text-accent-ink" : "bg-sunk"}`}>{letters[i]}</span>
                <span className="flex flex-col gap-2">
                  {o.text}
                  {o.imageFileId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/archivos/${o.imageFileId}`} alt="" className="max-h-28 rounded-md border border-line object-contain" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  if (type === "TRUE_FALSE") {
    const r = (response as { value?: boolean | null; justification?: string } | null) ?? {};
    const set = (patch: Partial<{ value: boolean | null; justification: string }>) => onChange({ value: r.value ?? null, justification: r.justification ?? "", ...patch });
    return (
      <>
        <p className="font-display text-[1.4em] leading-snug font-medium">{String(c.statement)}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {listen}
          <span>¿Es verdadero o falso?</span>
        </div>
        <div className="grid grid-cols-2 gap-3" role="radiogroup">
          {[true, false].map((v) => (
            <button key={String(v)} type="button" role="radio" aria-checked={r.value === v} onClick={() => set({ value: v })} className={`min-h-20 rounded-2xl border-2 font-display text-[1.25em] font-semibold ${r.value === v ? "border-accent bg-accent-soft text-accent" : "border-line bg-paper"}`}>
              {v ? "Verdadero" : "Falso"}
            </button>
          ))}
        </div>
        {Boolean(c.requireJustification) && (
          <label className="flex flex-col gap-2">
            <span className="font-bold">¿Por qué? Contalo con tus palabras.</span>
            <textarea value={r.justification ?? ""} onChange={(e) => set({ justification: e.target.value })} className="min-h-28 rounded-2xl border-2 border-line bg-paper p-3" maxLength={2000} />
            <div>
              <DictateButton onText={(t) => set({ justification: `${(r.justification ?? "").trim()} ${t}`.trim() })} />
            </div>
          </label>
        )}
      </>
    );
  }

  if (type === "MATCHING") return <MatchingInput item={item} response={response} onChange={onChange} order={order} listen={listen} />;
  if (type === "FILL_BLANKS") return <FillInput item={item} response={response} onChange={onChange} order={order} listen={listen} />;

  // Tachar
  const struck = new Set((response as { strikeIds?: string[] } | null)?.strikeIds ?? []);
  return <StrikeInput item={item} struck={struck} onChange={onChange} order={order} listen={listen} />;
}

const pairColors = ["#3346C8", "#1D8656", "#A96E12", "#C03D37", "#7A3FB8", "#0E7C86", "#B5367A", "#5B6480", "#8A5A00", "#2F6F3E"];

function MatchingInput({ item, response, onChange, order, listen }: { item: RunnerItem; response: unknown; onChange: (v: unknown) => void; order: <T>(l: T[]) => T[]; listen: React.ReactNode }) {
  const left = item.content.left as Opt[];
  const right = useMemo(() => order(item.content.right as Opt[]), [order, item.content.right]);
  const pairs = ((response as { pairs?: [string, string][] } | null)?.pairs ?? []) as [string, string][];
  const [selected, setSelected] = useState<string | null>(null);
  const leftIndex = (id: string) => left.findIndex((l) => l.id === id);
  const pairOfLeft = (id: string) => pairs.find(([l]) => l === id)?.[1];
  const pairOfRight = (id: string) => pairs.find(([, r]) => r === id)?.[0];

  const tapLeft = (id: string) => setSelected(selected === id ? null : id);
  const tapRight = (id: string) => {
    if (!selected) {
      const l = pairOfRight(id);
      if (l) onChange({ pairs: pairs.filter(([x]) => x !== l) }); // tocar una pareja ya hecha la deshace
      return;
    }
    onChange({ pairs: [...pairs.filter(([l, r]) => l !== selected && r !== id), [selected, id]] });
    setSelected(null);
  };

  const badge = (i: number) => (
    <span className="grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: pairColors[i % pairColors.length] }}>
      {i + 1}
    </span>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {listen}
        <span>{selected ? "Ahora tocá su pareja en la otra columna." : "Tocá un elemento de la izquierda y después su pareja."}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          {left.map((o, i) => {
            const paired = Boolean(pairOfLeft(o.id));
            return (
              <button key={o.id} type="button" aria-pressed={selected === o.id} onClick={() => tapLeft(o.id)} className={`flex min-h-14 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left ${selected === o.id ? "border-accent bg-accent-soft" : paired ? "border-ok bg-paper" : "border-line bg-paper"}`}>
                {badge(i)}
                <span>{o.text}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          {right.map((o) => {
            const l = pairOfRight(o.id);
            return (
              <button key={o.id} type="button" onClick={() => tapRight(o.id)} className={`flex min-h-14 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left ${l ? "border-ok bg-paper" : selected ? "border-dashed border-accent bg-paper" : "border-line bg-paper"}`}>
                {l ? badge(leftIndex(l)) : <span className="size-7 shrink-0 rounded-full border-2 border-dashed border-line" />}
                <span>{o.text}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-sm text-muted">
        {pairs.length} de {left.length} unidos. Tocá una pareja ya hecha para deshacerla.
      </p>
    </>
  );
}

function FillInput({ item, response, onChange, order, listen }: { item: RunnerItem; response: unknown; onChange: (v: unknown) => void; order: <T>(l: T[]) => T[]; listen: React.ReactNode }) {
  const answers = ((response as { answers?: Record<string, string> } | null)?.answers ?? {}) as Record<string, string>;
  const blanks = item.content.blanks as { id: string }[];
  const bank = useMemo(() => (Array.isArray(item.content.wordBank) ? order(item.content.wordBank as string[]) : null), [order, item.content.wordBank]);
  const [active, setActive] = useState<string | null>(blanks.find((b) => !answers[b.id])?.id ?? blanks[0]?.id ?? null);
  const set = (id: string, value: string) => onChange((prev: unknown) => ({ answers: { ...((prev as { answers?: Record<string, string> } | null)?.answers ?? {}), [id]: value } }));
  const used = new Set(Object.values(answers));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {listen}
        <span>{bank ? "Tocá un espacio y después la palabra." : "Completá lo que falta."}</span>
      </div>
      <p className="rounded-2xl border border-line bg-paper p-4 leading-[2.6]">
        {splitBlanks(String(item.content.text)).map((p, i) =>
          p.kind === "text" ? (
            <span key={i}>{p.value}</span>
          ) : (
            <input
              key={i}
              value={answers[p.id] ?? ""}
              onFocus={() => setActive(p.id)}
              onChange={(e) => set(p.id, e.target.value)}
              aria-label={`Espacio ${blanks.findIndex((b) => b.id === p.id) + 1}`}
              className={`mx-1 inline-block w-36 max-w-[45vw] rounded-md border-0 border-b-[3px] bg-transparent px-1 text-center font-bold text-accent ${active === p.id ? "border-accent bg-accent-soft" : "border-line"}`}
              autoComplete="off"
              autoCapitalize="none"
            />
          ),
        )}
      </p>
      {bank && (
        <div className="flex flex-col gap-2">
          <span className="font-bold">Palabras para usar</span>
          <div className="flex flex-wrap gap-2">
            {bank.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => {
                  const target = active ?? blanks.find((b) => !answers[b.id])?.id;
                  if (!target) return;
                  set(target, w);
                  const nextEmpty = blanks.find((b) => b.id !== target && !answers[b.id]);
                  setActive(nextEmpty?.id ?? target);
                }}
                className={`min-h-11 rounded-full border-2 px-4 ${used.has(w) ? "border-line text-muted line-through" : "border-accent bg-accent-soft font-bold text-accent"}`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function StrikeInput({ item, struck, onChange, order, listen }: { item: RunnerItem; struck: Set<string>; onChange: (v: unknown) => void; order: <T>(l: T[]) => T[]; listen: React.ReactNode }) {
  const phrases = useMemo(() => order(item.content.phrases as Opt[]), [order, item.content.phrases]);
  const [showText, setShowText] = useState(true);
  return (
    <>
      <div className="rounded-2xl border border-line bg-paper p-4">
        <div className="flex flex-wrap items-center gap-2">
          <b className="flex-1">Leé el texto</b>
          {listen}
          <button type="button" onClick={() => setShowText(!showText)} className="min-h-10 px-2 text-sm text-accent underline">
            {showText ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {showText && <p className="mt-2">{String(item.content.topicText)}</p>}
      </div>
      <p className="font-bold">
        Tachá las frases que <u>no</u> corresponden.
      </p>
      <div className="flex flex-col gap-2">
        {phrases.map((p) => {
          const on = struck.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange((prev: unknown) => {
                  const current = new Set((prev as { strikeIds?: string[] } | null)?.strikeIds ?? []);
                  if (current.has(p.id)) current.delete(p.id);
                  else current.add(p.id);
                  return { strikeIds: [...current] };
                })
              }
              className={`flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 py-2 text-left ${on ? "border-bad bg-bad-soft" : "border-line bg-paper"}`}
            >
              <span className={`grid size-6 shrink-0 place-items-center rounded-md border-2 font-bold ${on ? "border-bad text-bad" : "border-line"}`}>{on ? "✕" : ""}</span>
              <span className={on ? "text-muted line-through decoration-bad decoration-[3px]" : ""}>{p.text}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ---------- Revisar y entregar ----------

function Review({ type, items, taskId, overdue, submit, responses, onGo, doneCount, flushAll }: Props & { responses: Record<string, unknown>; onGo: (i: number) => void; doneCount: number; flushAll: () => Promise<boolean> }) {
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = items.length - doneCount;

  async function deliver() {
    setSending(true);
    setError(null);
    if (!(await flushAll())) {
      setSending(false);
      setError("Todavía no se guardaron todas tus respuestas. Revisá tu conexión y probá de nuevo.");
      return;
    }
    const result = await submit(taskId).catch(() => ({ error: "No se pudo entregar. Revisá tu conexión y probá de nuevo." }));
    if (result?.error) {
      setSending(false);
      setError(result.error);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-4">
      <h1 className="font-display text-[1.5em] font-semibold">Revisá antes de entregar</h1>
      {overdue && <div className="rounded-xl border border-bad bg-bad-soft p-3 text-base">Esta tarea ya venció. Podés entregarla igual: va a quedar como fuera de término.</div>}
      <p className="text-muted">
        Respondiste {doneCount} de {items.length}.
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => {
          const ok = answered(type, it, responses[it.id]);
          return (
            <li key={it.id}>
              <button type="button" onClick={() => onGo(i)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${ok ? "border-line bg-paper" : "border-sun bg-sun-soft"}`}>
                <span className={`size-2.5 shrink-0 rounded-full ${ok ? "bg-ok" : "bg-sun"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">
                    {i + 1}. {itemSummary(type, it)}
                  </span>
                  <span className="text-sm text-muted">{it.carriedOver ? "Ya estaba bien" : ok ? "Respondida · tocá para cambiarla" : "Te falta responder esta"}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <div role="alert" className="rounded-xl border border-bad bg-bad-soft p-3">
          {error}
        </div>
      )}
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className="min-h-12 rounded-xl bg-accent px-5 text-lg font-bold text-accent-ink">
          Entregar tarea
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-accent bg-paper p-4">
          <p className="font-bold">¿Entregás la tarea? Después no la vas a poder cambiar.</p>
          {missing > 0 && <p className="text-warn">Te {missing === 1 ? "falta 1 pregunta" : `faltan ${missing} preguntas`}. Las que no respondas cuentan como incorrectas.</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => setConfirming(false)} disabled={sending} className="min-h-12 flex-1 rounded-xl border border-line bg-paper font-bold">
              Volver
            </button>
            <button type="button" onClick={deliver} disabled={sending} className="min-h-12 flex-[2] rounded-xl bg-accent px-5 font-bold text-accent-ink disabled:opacity-60">
              {sending ? "Entregando…" : "Sí, entregar"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
