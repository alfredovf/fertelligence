import type { z } from "zod";
import { taskTypeSchemas, type TaskTypeName } from "./task-types";

// Precorrección: calcula el puntaje sugerido de cada ítem y la nota sugerida de la tarea.
// Todo es una sugerencia: el docente puede cambiar puntajes y nota antes de aprobar.

type Schemas = typeof taskTypeSchemas;
type Content<T extends TaskTypeName> = z.infer<Schemas[T]["content"]>;
type Correct<T extends TaskTypeName> = z.infer<Schemas[T]["correct"]>;
type Response<T extends TaskTypeName> = z.infer<Schemas[T]["response"]>;

export type ItemScore = {
  points: number; // puntaje sugerido automáticamente
  needsReview: boolean; // hay una parte que corrige el docente (justificación)
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);

export function normalizeText(text: string, keepAccents: boolean): string {
  let value = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!keepAccents) value = value.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return value;
}

function scoreMultipleChoice(c: Content<"MULTIPLE_CHOICE">, k: Correct<"MULTIPLE_CHOICE">, r: Response<"MULTIPLE_CHOICE">, max: number): number {
  const correct = new Set(k.optionIds);
  const chosen = new Set(r.optionIds);
  if (!c.multiple) {
    const [only] = [...chosen];
    return chosen.size === 1 && only !== undefined && correct.has(only) ? max : 0;
  }
  // Puntaje parcial: cada correcta marcada suma una parte, cada incorrecta resta lo mismo, mínimo 0.
  const share = max / correct.size;
  let points = 0;
  for (const optionId of chosen) points += correct.has(optionId) ? share : -share;
  return clamp(points, max);
}

function scoreTrueFalse(c: Content<"TRUE_FALSE">, k: Correct<"TRUE_FALSE">, r: Response<"TRUE_FALSE">, max: number): ItemScore {
  const justification = c.requireJustification ? Math.min(c.justificationPoints, max) : 0;
  const valuePoints = r.value === k.value ? max - justification : 0;
  return { points: valuePoints, needsReview: c.requireJustification && justification > 0 };
}

function scoreMatching(k: Correct<"MATCHING">, r: Response<"MATCHING">, max: number): number {
  const expected = new Map(k.pairs.map(([left, right]) => [left, right]));
  const share = max / expected.size;
  let points = 0;
  for (const [left, right] of r.pairs) if (expected.get(left) === right) points += share;
  return clamp(points, max);
}

function scoreFillBlanks(c: Content<"FILL_BLANKS">, k: Correct<"FILL_BLANKS">, r: Response<"FILL_BLANKS">, max: number): number {
  const share = max / c.blanks.length;
  let points = 0;
  for (const blank of c.blanks) {
    const given = r.answers[blank.id];
    const accepted = k.answers[blank.id] ?? [];
    if (given === undefined) continue;
    const normalized = normalizeText(given, c.requireAccents);
    if (accepted.some((answer) => normalizeText(answer, c.requireAccents) === normalized)) points += share;
  }
  return clamp(points, max);
}

function scoreStrikeOut(c: Content<"STRIKE_OUT">, k: Correct<"STRIKE_OUT">, r: Response<"STRIKE_OUT">, max: number): number {
  // Cada frase vale lo mismo: bien si se tachó cuando correspondía, o se dejó cuando no.
  const shouldStrike = new Set(k.strikeIds);
  const struck = new Set(r.strikeIds);
  const share = max / c.phrases.length;
  let points = 0;
  for (const phrase of c.phrases) if (shouldStrike.has(phrase.id) === struck.has(phrase.id)) points += share;
  return clamp(points, max);
}

export function scoreItem(type: TaskTypeName, content: unknown, correct: unknown, response: unknown, maxPoints: number): ItemScore {
  const s = taskTypeSchemas[type];
  const c = s.content.parse(content);
  const k = s.correct.parse(correct);
  const parsed = s.response.safeParse(response);
  if (!parsed.success) return { points: 0, needsReview: false }; // sin responder o respuesta inválida

  let result: ItemScore;
  switch (type) {
    case "MULTIPLE_CHOICE":
      result = { points: scoreMultipleChoice(c as Content<"MULTIPLE_CHOICE">, k as Correct<"MULTIPLE_CHOICE">, parsed.data as Response<"MULTIPLE_CHOICE">, maxPoints), needsReview: false };
      break;
    case "TRUE_FALSE":
      result = scoreTrueFalse(c as Content<"TRUE_FALSE">, k as Correct<"TRUE_FALSE">, parsed.data as Response<"TRUE_FALSE">, maxPoints);
      break;
    case "MATCHING":
      result = { points: scoreMatching(k as Correct<"MATCHING">, parsed.data as Response<"MATCHING">, maxPoints), needsReview: false };
      break;
    case "FILL_BLANKS":
      result = { points: scoreFillBlanks(c as Content<"FILL_BLANKS">, k as Correct<"FILL_BLANKS">, parsed.data as Response<"FILL_BLANKS">, maxPoints), needsReview: false };
      break;
    case "STRIKE_OUT":
      result = { points: scoreStrikeOut(c as Content<"STRIKE_OUT">, k as Correct<"STRIKE_OUT">, parsed.data as Response<"STRIKE_OUT">, maxPoints), needsReview: false };
      break;
  }
  return { ...result, points: round2(result.points) };
}

// Nota entera de 0 a 10: puntos obtenidos / puntos posibles × 10, redondeada al entero más cercano (0,5 sube).
export function suggestedGrade(items: { points: number; maxPoints: number }[]): number {
  const max = items.reduce((sum, item) => sum + item.maxPoints, 0);
  if (max <= 0) return 0;
  const obtained = items.reduce((sum, item) => sum + item.points, 0);
  const raw = Math.round((obtained / max) * 10 * 1e6) / 1e6; // evita errores de coma flotante
  return Math.min(10, Math.max(0, Math.floor(raw + 0.5)));
}

export function isPassing(grade: number, passGrade = 7): boolean {
  return grade >= passGrade;
}
