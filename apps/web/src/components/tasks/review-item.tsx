import { normalizeText, splitBlanks, type TaskTypeName } from "@fertelligence/core";

// Respuesta del alumno frente a la correcta. Lo usan el docente al corregir y el alumno al ver su resultado.

type Opt = { id: string; text: string; imageFileId?: string };
export type ReviewData = { content: unknown; correct: unknown; response: unknown };

const okText = "text-ok font-bold";
const badText = "text-bad font-bold";

function Mark({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 ${ok ? okText : badText}`}>
      <span aria-hidden="true">{ok ? "✓" : "✗"}</span>
      {children}
    </span>
  );
}

export function ReviewItem({ type, data, audience }: { type: TaskTypeName; data: ReviewData; audience: "teacher" | "student" }) {
  const c = data.content as Record<string, unknown>;
  const k = data.correct as Record<string, unknown>;
  const r = (data.response ?? null) as Record<string, unknown> | null;
  const noAnswer = <p className="text-sm text-muted">{audience === "student" ? "No respondiste esta pregunta." : "Sin responder."}</p>;

  if (type === "MULTIPLE_CHOICE") {
    const chosen = new Set((r?.optionIds as string[] | undefined) ?? []);
    const correct = new Set(k.optionIds as string[]);
    return (
      <div className="flex flex-col gap-2">
        <p className="font-display text-lg">{String(c.question)}</p>
        <ul className="flex flex-col gap-1.5">
          {(c.options as Opt[]).map((o) => {
            const isChosen = chosen.has(o.id);
            const isCorrect = correct.has(o.id);
            return (
              <li key={o.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${isCorrect ? "border-ok bg-ok-soft" : isChosen ? "border-bad bg-bad-soft" : "border-line"}`}>
                <span className="flex-1">{o.text}</span>
                {isChosen && <span className="text-sm font-bold">{audience === "student" ? "Tu respuesta" : "Eligió"}</span>}
                {isCorrect && <span className="text-sm font-bold text-ok">Correcta</span>}
              </li>
            );
          })}
        </ul>
        {chosen.size === 0 && noAnswer}
      </div>
    );
  }

  if (type === "TRUE_FALSE") {
    const value = r?.value as boolean | null | undefined;
    const label = (v: boolean) => (v ? "Verdadero" : "Falso");
    return (
      <div className="flex flex-col gap-2">
        <p className="font-display text-lg">{String(c.statement)}</p>
        {typeof value === "boolean" ? (
          <p>
            {audience === "student" ? "Respondiste " : "Marcó "}
            <Mark ok={value === k.value}>{label(value)}</Mark>
            {value !== k.value && <span>. Era {label(Boolean(k.value))}.</span>}
          </p>
        ) : (
          noAnswer
        )}
        {Boolean(c.requireJustification) && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-bold text-muted">{audience === "student" ? "Tu justificación" : "Justificación del alumno"}</span>
            <p className="rounded-lg bg-sunk p-3">{String(r?.justification ?? "").trim() || <span className="text-muted">Sin justificación.</span>}</p>
            {audience === "teacher" && Boolean(k.expectedJustification) && <p className="text-sm text-muted">Esperada: {String(k.expectedJustification)}</p>}
          </div>
        )}
      </div>
    );
  }

  if (type === "MATCHING") {
    const given = new Map(((r?.pairs as [string, string][] | undefined) ?? []).map(([l, rr]) => [l, rr]));
    const expected = new Map((k.pairs as [string, string][]).map(([l, rr]) => [l, rr]));
    const rightText = (id?: string) => (c.right as Opt[]).find((o) => o.id === id)?.text;
    return (
      <ul className="flex flex-col gap-1.5">
        {(c.left as Opt[]).map((o) => {
          const g = given.get(o.id);
          const ok = g === expected.get(o.id);
          return (
            <li key={o.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${ok ? "border-ok bg-ok-soft" : "border-bad bg-bad-soft"}`}>
              <b>{o.text}</b>
              <span aria-hidden="true">→</span>
              <span>{rightText(g) ?? <span className="text-muted">sin unir</span>}</span>
              {!ok && <span className="text-sm">(correcta: {rightText(expected.get(o.id))})</span>}
            </li>
          );
        })}
      </ul>
    );
  }

  if (type === "FILL_BLANKS") {
    const answers = (r?.answers as Record<string, string> | undefined) ?? {};
    const accepted = k.answers as Record<string, string[]>;
    const keep = Boolean(c.requireAccents);
    return (
      <p className="leading-9">
        {splitBlanks(String(c.text)).map((p, i) => {
          if (p.kind === "text") return <span key={i}>{p.value}</span>;
          const given = answers[p.id] ?? "";
          const ok = (accepted[p.id] ?? []).some((a) => normalizeText(a, keep) === normalizeText(given, keep));
          return (
            <span key={i} className={`mx-1 inline-flex flex-wrap items-baseline gap-1 rounded-md px-1.5 ${ok ? "bg-ok-soft" : "bg-bad-soft"}`}>
              <Mark ok={ok}>{given.trim() || "…"}</Mark>
              {!ok && <span className="text-sm">({(accepted[p.id] ?? []).join(" / ")})</span>}
            </span>
          );
        })}
      </p>
    );
  }

  // Tachar
  const struck = new Set((r?.strikeIds as string[] | undefined) ?? []);
  const should = new Set(k.strikeIds as string[]);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">{String(c.topicText)}</p>
      <ul className="flex flex-col gap-1.5">
        {(c.phrases as Opt[]).map((p) => {
          const ok = struck.has(p.id) === should.has(p.id);
          return (
            <li key={p.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${ok ? "border-ok bg-ok-soft" : "border-bad bg-bad-soft"}`}>
              <span className={`flex-1 ${struck.has(p.id) ? "line-through" : ""}`}>{p.text}</span>
              <span className="text-sm">{should.has(p.id) ? "No corresponde" : "Corresponde"}</span>
              <Mark ok={ok}>{ok ? "Bien" : struck.has(p.id) ? "No había que tacharla" : "Había que tacharla"}</Mark>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
