import { z } from "zod";
import { taskTypeSchemas, type TaskTypeName } from "./task-types";

// Reglas de armado de tareas: lo que el editor del docente (y más adelante la IA) tiene que cumplir.

export const MAX_ITEMS = 30;

// Un ítem tal como lo envía el editor.
export const editorItem = z.object({
  content: z.unknown(),
  correct: z.unknown(),
  maxPoints: z.coerce.number().positive("Cada ítem tiene que valer más de 0 puntos.").max(100, "Un ítem no puede valer más de 100 puntos."),
  explanation: z.string().trim().max(2000).optional().nullable(),
  imageFileId: z.string().uuid().optional().nullable(),
});
export type EditorItem = z.infer<typeof editorItem>;

const unique = (values: string[]) => new Set(values).size === values.length;

// Valida forma y coherencia de un ítem. Devuelve un mensaje legible o null si está bien.
export function itemProblem(type: TaskTypeName, item: EditorItem): string | null {
  const schema = taskTypeSchemas[type];
  const content = schema.content.safeParse(item.content);
  if (!content.success) return "Falta completar el contenido.";
  const correct = schema.correct.safeParse(item.correct);
  if (!correct.success) return "Falta marcar la respuesta correcta.";

  switch (type) {
    case "MULTIPLE_CHOICE": {
      const c = content.data as z.infer<typeof taskTypeSchemas.MULTIPLE_CHOICE.content>;
      const k = correct.data as z.infer<typeof taskTypeSchemas.MULTIPLE_CHOICE.correct>;
      if (!c.question.trim()) return "Escribí la pregunta.";
      if (c.options.some((o) => !o.text.trim() && !o.imageFileId)) return "Hay una opción vacía.";
      if (!unique(c.options.map((o) => o.id))) return "Hay opciones repetidas.";
      const ids = new Set(c.options.map((o) => o.id));
      if (k.optionIds.some((id) => !ids.has(id))) return "La respuesta correcta no está entre las opciones.";
      if (!c.multiple && k.optionIds.length !== 1) return "Marcá una sola opción correcta (o activá varias respuestas).";
      if (k.optionIds.length >= c.options.length) return "Tiene que haber al menos una opción incorrecta.";
      return null;
    }
    case "TRUE_FALSE": {
      const c = content.data as z.infer<typeof taskTypeSchemas.TRUE_FALSE.content>;
      if (!c.statement.trim()) return "Escribí la afirmación.";
      if (c.requireJustification && c.justificationPoints >= item.maxPoints) return "Los puntos de la justificación tienen que ser menos que el puntaje del ítem.";
      return null;
    }
    case "MATCHING": {
      const c = content.data as z.infer<typeof taskTypeSchemas.MATCHING.content>;
      const k = correct.data as z.infer<typeof taskTypeSchemas.MATCHING.correct>;
      if ([...c.left, ...c.right].some((o) => !o.text.trim() && !o.imageFileId)) return "Hay un elemento vacío.";
      const left = new Set(c.left.map((o) => o.id));
      const right = new Set(c.right.map((o) => o.id));
      if (k.pairs.length !== c.left.length) return "Cada elemento de la izquierda tiene que tener su pareja.";
      if (k.pairs.some(([l, r]) => !left.has(l) || !right.has(r))) return "Hay una pareja con un elemento que no existe.";
      if (!unique(k.pairs.map(([, r]) => r))) return "Dos elementos de la izquierda no pueden tener la misma pareja.";
      return null;
    }
    case "FILL_BLANKS": {
      const c = content.data as z.infer<typeof taskTypeSchemas.FILL_BLANKS.content>;
      const k = correct.data as z.infer<typeof taskTypeSchemas.FILL_BLANKS.correct>;
      const markers = [...c.text.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]!);
      if (markers.length === 0) return "Marcá al menos un hueco poniendo la palabra entre corchetes dobles, por ejemplo [[gaseoso]].";
      if (!unique(markers) || markers.length !== c.blanks.length || c.blanks.some((b) => !markers.includes(b.id))) return "Los huecos del texto no coinciden con las respuestas.";
      if (c.blanks.some((b) => !k.answers[b.id]?.some((a) => a.trim()))) return "Cada hueco tiene que tener al menos una respuesta aceptada.";
      return null;
    }
    case "STRIKE_OUT": {
      const c = content.data as z.infer<typeof taskTypeSchemas.STRIKE_OUT.content>;
      const k = correct.data as z.infer<typeof taskTypeSchemas.STRIKE_OUT.correct>;
      if (!c.topicText.trim()) return "Escribí el texto del tema.";
      if (c.phrases.some((p) => !p.text.trim())) return "Hay una frase vacía.";
      const ids = new Set(c.phrases.map((p) => p.id));
      if (k.strikeIds.length === 0) return "Marcá al menos una frase que no corresponda.";
      if (k.strikeIds.length === c.phrases.length) return "Tiene que quedar al menos una frase que sí corresponda.";
      if (k.strikeIds.some((id) => !ids.has(id))) return "Hay una frase marcada que no existe.";
      return null;
    }
  }
}

// ---------- Completar: el docente escribe "El agua pasa a estado [[gaseoso]]." ----------
// Varias respuestas aceptadas se separan con barra: [[evaporación|vaporización]].

export function parseBlanksMarkup(markup: string): { text: string; blanks: { id: string }[]; answers: Record<string, string[]> } {
  let n = 0;
  const answers: Record<string, string[]> = {};
  const text = markup.replace(/\[\[([^\]]*)\]\]/g, (_, inner: string) => {
    const id = `b${++n}`;
    answers[id] = inner.split("|").map((s) => s.trim()).filter(Boolean);
    return `{{${id}}}`;
  });
  return { text, blanks: Object.keys(answers).map((id) => ({ id })), answers };
}

export function toBlanksMarkup(text: string, answers: Record<string, string[]>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, id: string) => `[[${(answers[id] ?? []).join("|")}]]`);
}

// Divide el texto en partes de texto y huecos, para mostrarlo al alumno o imprimirlo.
export function splitBlanks(text: string): ({ kind: "text"; value: string } | { kind: "blank"; id: string })[] {
  const parts: ({ kind: "text"; value: string } | { kind: "blank"; id: string })[] = [];
  let last = 0;
  for (const match of text.matchAll(/\{\{([^}]+)\}\}/g)) {
    if (match.index! > last) parts.push({ kind: "text", value: text.slice(last, match.index) });
    parts.push({ kind: "blank", id: match[1]! });
    last = match.index! + match[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", value: text.slice(last) });
  return parts;
}

// Ítem vacío de cada tipo, para "Agregar ítem" en el editor.
export function emptyItem(type: TaskTypeName): EditorItem {
  switch (type) {
    case "MULTIPLE_CHOICE":
      return { content: { question: "", multiple: false, options: [{ id: "o1", text: "" }, { id: "o2", text: "" }, { id: "o3", text: "" }] }, correct: { optionIds: [] }, maxPoints: 1, explanation: "" };
    case "TRUE_FALSE":
      return { content: { statement: "", requireJustification: false, justificationPoints: 0 }, correct: { value: true }, maxPoints: 1, explanation: "" };
    case "MATCHING":
      return { content: { left: [{ id: "l1", text: "" }, { id: "l2", text: "" }, { id: "l3", text: "" }], right: [{ id: "r1", text: "" }, { id: "r2", text: "" }, { id: "r3", text: "" }] }, correct: { pairs: [["l1", "r1"], ["l2", "r2"], ["l3", "r3"]] }, maxPoints: 3, explanation: "" };
    case "FILL_BLANKS":
      return { content: { text: "", blanks: [], requireAccents: false }, correct: { answers: {} }, maxPoints: 1, explanation: "" };
    case "STRIKE_OUT":
      return { content: { topicText: "", phrases: [{ id: "p1", text: "" }, { id: "p2", text: "" }, { id: "p3", text: "" }, { id: "p4", text: "" }] }, correct: { strikeIds: [] }, maxPoints: 4, explanation: "" };
  }
}

// Todos los ids de archivo que usa un ítem (imagen del ítem e imágenes de opciones).
export function itemFileIds(item: { imageFileId?: string | null; content: unknown }): string[] {
  const ids = item.imageFileId ? [item.imageFileId] : [];
  const c = item.content as { options?: { imageFileId?: string }[]; left?: { imageFileId?: string }[]; right?: { imageFileId?: string }[] };
  for (const o of [...(c?.options ?? []), ...(c?.left ?? []), ...(c?.right ?? [])]) if (o.imageFileId) ids.push(o.imageFileId);
  return ids;
}
