import { splitBlanks, type TaskTypeName } from "@fertelligence/core";

// Cómo se ve cada ítem para el alumno (vista previa) y en papel (impresión).
// En la etapa 3 la versión interactiva para resolver reemplaza a la vista previa.

type Opt = { id: string; text: string; imageFileId?: string };
export type RenderItem = { id: string; content: unknown; correct: unknown; maxPoints: number; explanation: string | null; imageFileId: string | null };

// Mezcla estable: mismo resultado para la misma semilla (cada alumno ve siempre el mismo orden).
export function seededShuffle<T>(list: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function Img({ id, className }: { id?: string | null; className?: string }) {
  if (!id) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/archivos/${id}`} alt="" className={className ?? "max-h-48 rounded-lg border border-line object-contain"} />;
}

const letters = "ABCDEFGHIJ";

// ---------- Vista del alumno (pantalla) ----------

export function StudentItemPreview({ type, item, shuffle, seed }: { type: TaskTypeName; item: RenderItem; shuffle: boolean; seed: string }) {
  const c = item.content as Record<string, unknown>;
  const order = <T,>(list: T[]) => (shuffle ? seededShuffle(list, `${seed}:${item.id}`) : list);
  const box = "flex items-center gap-3 rounded-xl border-2 border-line bg-paper px-4 py-3 text-base";

  return (
    <div className="flex flex-col gap-3">
      <Img id={item.imageFileId} />
      {type === "MULTIPLE_CHOICE" && (
        <>
          <p className="font-display text-xl">{String(c.question)}</p>
          <p className="text-sm text-muted">{c.multiple ? "Podés elegir más de una." : "Elegí una."}</p>
          {order(c.options as Opt[]).map((o, i) => (
            <div key={o.id} className={box}>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sunk font-display font-semibold">{letters[i]}</span>
              <span className="flex flex-col gap-2">
                {o.text}
                <Img id={o.imageFileId} className="max-h-24 rounded-md border border-line" />
              </span>
            </div>
          ))}
        </>
      )}
      {type === "TRUE_FALSE" && (
        <>
          <p className="font-display text-xl">{String(c.statement)}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className={`${box} justify-center font-display text-lg font-semibold`}>Verdadero</div>
            <div className={`${box} justify-center font-display text-lg font-semibold`}>Falso</div>
          </div>
          {Boolean(c.requireJustification) && <div className="min-h-20 rounded-xl border-2 border-dashed border-line p-3 text-muted">¿Por qué? Escribilo o dictalo.</div>}
        </>
      )}
      {type === "MATCHING" && (
        <div className="grid grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            {(c.left as Opt[]).map((o) => (
              <div key={o.id} className={box}>
                {o.text}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {order(c.right as Opt[]).map((o) => (
              <div key={o.id} className={box}>
                {o.text}
              </div>
            ))}
          </div>
        </div>
      )}
      {type === "FILL_BLANKS" && (
        <>
          <p className="rounded-xl border border-line bg-paper p-4 text-lg leading-10">
            {splitBlanks(String(c.text)).map((p, i) =>
              p.kind === "text" ? <span key={i}>{p.value}</span> : <span key={i} className="mx-1 inline-block w-28 border-b-2 border-accent align-baseline" />,
            )}
          </p>
          {Array.isArray(c.wordBank) && (
            <div className="flex flex-wrap gap-2">
              {order(c.wordBank as string[]).map((w) => (
                <span key={w} className="rounded-full border border-line bg-paper px-3 py-1.5">
                  {w}
                </span>
              ))}
            </div>
          )}
        </>
      )}
      {type === "STRIKE_OUT" && (
        <>
          <p className="rounded-xl border border-line bg-paper p-4">{String(c.topicText)}</p>
          <p className="text-sm text-muted">Tachá las frases que no corresponden.</p>
          {order(c.phrases as Opt[]).map((p) => (
            <div key={p.id} className={box}>
              <span className="size-5 shrink-0 rounded-md border-2 border-line" />
              {p.text}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ---------- Versión para imprimir ----------

export function PrintItem({ type, item, index, withAnswers }: { type: TaskTypeName; item: RenderItem; index: number; withAnswers: boolean }) {
  const c = item.content as Record<string, unknown>;
  const k = item.correct as Record<string, unknown>;
  const box = "inline-block size-4 border border-current align-[-2px]";
  const checked = (on: boolean) => (withAnswers && on ? <span className={`${box} bg-current`} /> : <span className={box} />);

  return (
    <section className="break-inside-avoid border-b border-neutral-300 py-4">
      <div className="mb-2 flex gap-2">
        <b>{index + 1}.</b>
        <div className="flex-1">
          {type === "MULTIPLE_CHOICE" && <p>{String(c.question)}</p>}
          {type === "TRUE_FALSE" && <p>{String(c.statement)}</p>}
          {type === "MATCHING" && <p>Uní con flechas cada elemento con su pareja.</p>}
          {type === "STRIKE_OUT" && <p>{String(c.topicText)}</p>}
        </div>
        <span className="text-sm text-neutral-500">{item.maxPoints} pts</span>
      </div>
      {item.imageFileId && <Img id={item.imageFileId} className="mb-2 max-h-40" />}

      {type === "MULTIPLE_CHOICE" && (
        <ul className="flex flex-col gap-1.5 pl-6">
          {(c.options as Opt[]).map((o) => (
            <li key={o.id} className="flex items-center gap-2">
              {checked((k.optionIds as string[]).includes(o.id))} {o.text}
            </li>
          ))}
          <li className="text-sm text-neutral-500">{c.multiple ? "Puede haber más de una respuesta correcta." : "Marcá una sola."}</li>
        </ul>
      )}
      {type === "TRUE_FALSE" && (
        <div className="flex flex-col gap-2 pl-6">
          <div className="flex gap-6">
            <span>{checked(k.value === true)} Verdadero</span>
            <span>{checked(k.value === false)} Falso</span>
          </div>
          {Boolean(c.requireJustification) && (
            <>
              <span className="text-sm">¿Por qué?</span>
              {withAnswers && k.expectedJustification ? <p className="italic">{String(k.expectedJustification)}</p> : (<><div className="h-6 border-b border-neutral-400" /><div className="h-6 border-b border-neutral-400" /></>)}
            </>
          )}
        </div>
      )}
      {type === "MATCHING" && (
        <div className="grid grid-cols-2 gap-x-16 gap-y-2 pl-6">
          <ol className="flex list-decimal flex-col gap-3 pl-4">
            {(c.left as Opt[]).map((o) => (
              <li key={o.id}>{o.text} ●</li>
            ))}
          </ol>
          <ol className="flex flex-col gap-3" style={{ listStyleType: "upper-alpha" }}>
            {seededShuffle(c.right as Opt[], item.id).map((o) => (
              <li key={o.id} className="ml-4">
                ● {o.text}
                {withAnswers && <span className="ml-2 text-sm">(pareja de {1 + (c.left as Opt[]).findIndex((l) => (k.pairs as [string, string][]).some(([lid, rid]) => lid === l.id && rid === o.id))})</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
      {type === "FILL_BLANKS" && (
        <div className="pl-6">
          <p className="leading-9">
            {splitBlanks(String(c.text)).map((p, i) =>
              p.kind === "text" ? (
                <span key={i}>{p.value}</span>
              ) : withAnswers ? (
                <u key={i} className="mx-1 font-bold">
                  {((k.answers as Record<string, string[]>)[p.id] ?? []).join(" / ")}
                </u>
              ) : (
                <span key={i}> ________________ </span>
              ),
            )}
          </p>
          {Array.isArray(c.wordBank) && <p className="mt-2 text-sm">Palabras: {seededShuffle(c.wordBank as string[], item.id).join(" · ")}</p>}
        </div>
      )}
      {type === "STRIKE_OUT" && (
        <ul className="flex flex-col gap-1.5 pl-6">
          <li className="text-sm text-neutral-500">Tachá las frases que no corresponden.</li>
          {(c.phrases as Opt[]).map((p) => (
            <li key={p.id} className={withAnswers && (k.strikeIds as string[]).includes(p.id) ? "line-through" : ""}>
              • {p.text}
            </li>
          ))}
        </ul>
      )}
      {withAnswers && item.explanation && <p className="mt-2 pl-6 text-sm italic">Explicación: {item.explanation}</p>}
    </section>
  );
}
