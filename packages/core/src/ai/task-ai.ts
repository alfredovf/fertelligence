import { emptyItem, itemProblem, parseBlanksMarkup, type EditorItem } from "../task-authoring";
import type { TaskTypeName } from "../task-types";
import { generateJson, type GeminiPart, type GeminiUsage } from "./gemini";

// Creación de tareas con IA. A Gemini se le pide un formato simple por tipo (fácil de producir sin errores)
// y acá se convierte al formato del editor, con ids propios, y se valida ítem por ítem.
// Nunca se envían datos de alumnos: solo el contenido del ejercicio.

const S = { type: "STRING" } as const;
const B = { type: "BOOLEAN" } as const;
const N = { type: "NUMBER" } as const;
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "OBJECT", properties, required });
const arr = (items: unknown) => ({ type: "ARRAY", items });

const itemSchemas: Record<TaskTypeName, unknown> = {
  MULTIPLE_CHOICE: obj({ question: S, options: arr(obj({ text: S, correct: B })), explanation: S }),
  TRUE_FALSE: obj({ statement: S, answer: B, requireJustification: B, expectedJustification: S, explanation: S }),
  MATCHING: obj({ pairs: arr(obj({ left: S, right: S })), distractors: arr(S), explanation: S }),
  FILL_BLANKS: obj({ text: S, explanation: S }),
  STRIKE_OUT: obj({ topicText: S, phrases: arr(obj({ text: S, belongs: B })), explanation: S }),
};

const taskSchema = (type: TaskTypeName) =>
  obj({ title: S, instructions: S, items: arr(itemSchemas[type]), notes: arr(S) }, ["title", "instructions", "items", "notes"]);

const typeRules: Record<TaskTypeName, string> = {
  MULTIPLE_CHOICE: "Cada ítem: una pregunta y sus opciones; marcá con correct=true las correctas. Los distractores tienen que ser plausibles, del mismo tema y de largo parecido a la correcta.",
  TRUE_FALSE: "Cada ítem: una afirmación y si es verdadera (answer). Mezclá verdaderas y falsas. Las falsas no tienen que ser trampas por un detalle mínimo.",
  MATCHING: "Cada ítem: una lista de parejas correctas (left → right). Si se piden distractores, son elementos extra de la columna derecha sin pareja.",
  FILL_BLANKS: "Cada ítem: un texto donde lo que el alumno completa va entre corchetes dobles, por ejemplo: El agua pasa a estado [[gaseoso]]. Si hay varias respuestas válidas, separalas con barra: [[evaporación|vaporización]]. Los huecos son palabras clave, no artículos ni conectores.",
  STRIKE_OUT: "Cada ítem: un texto breve del tema (topicText) y frases; belongs=true si la frase corresponde al tema según el texto, false si no corresponde (esas son las que el alumno tacha). Tiene que haber de las dos.",
};

const SYSTEM = `Sos un asistente que ayuda a docentes de Argentina a armar tareas escolares para alumnos de 10 a 18 años con dificultades de atención.
Escribís en español rioplatense neutro, con oraciones cortas y vocabulario claro.
La consigna general (instructions) es una sola oración que dice qué hacer.
Cada explicación (explanation) dice en una o dos oraciones por qué la respuesta es la correcta, en tono positivo.
En notes anotás en pocas palabras lo que el docente debería revisar (algo ilegible, una respuesta dudosa, una suposición). Si no hay nada, notes queda vacío.`;

type AiItem = Record<string, unknown>;
let counter = 0;
const nid = (p: string) => `${p}${Date.now().toString(36).slice(-4)}${(counter++).toString(36)}`;

export function toEditorItem(type: TaskTypeName, raw: AiItem, pointsPerItem: number): EditorItem {
  const explanation = String(raw.explanation ?? "").trim();
  switch (type) {
    case "MULTIPLE_CHOICE": {
      const options = ((raw.options as { text: string; correct: boolean }[]) ?? []).filter((o) => String(o.text ?? "").trim());
      const withIds = options.map((o) => ({ id: nid("o"), text: String(o.text).trim(), correct: Boolean(o.correct) }));
      const correct = withIds.filter((o) => o.correct).map((o) => o.id);
      return { content: { question: String(raw.question ?? "").trim(), multiple: correct.length > 1, options: withIds.map(({ id, text }) => ({ id, text })) }, correct: { optionIds: correct }, maxPoints: pointsPerItem, explanation };
    }
    case "TRUE_FALSE": {
      const requireJustification = Boolean(raw.requireJustification);
      const max = requireJustification ? Math.max(pointsPerItem, 2) : pointsPerItem;
      return {
        content: { statement: String(raw.statement ?? "").trim(), requireJustification, justificationPoints: requireJustification ? Math.floor(max / 2) : 0 },
        correct: { value: Boolean(raw.answer), ...(requireJustification && raw.expectedJustification ? { expectedJustification: String(raw.expectedJustification) } : {}) },
        maxPoints: max,
        explanation,
      };
    }
    case "MATCHING": {
      const pairs = ((raw.pairs as { left: string; right: string }[]) ?? []).filter((p) => String(p.left ?? "").trim() && String(p.right ?? "").trim());
      const rows = pairs.map((p) => ({ left: { id: nid("l"), text: String(p.left).trim() }, right: { id: nid("r"), text: String(p.right).trim() } }));
      const distractors = ((raw.distractors as string[]) ?? []).filter((d) => String(d).trim()).map((d) => ({ id: nid("r"), text: String(d).trim() }));
      return {
        content: { left: rows.map((r) => r.left), right: [...rows.map((r) => r.right), ...distractors] },
        correct: { pairs: rows.map((r) => [r.left.id, r.right.id]) },
        maxPoints: Math.max(pointsPerItem, rows.length),
        explanation,
      };
    }
    case "FILL_BLANKS": {
      const parsed = parseBlanksMarkup(String(raw.text ?? ""));
      return { content: { text: parsed.text, blanks: parsed.blanks, requireAccents: false }, correct: { answers: parsed.answers }, maxPoints: Math.max(pointsPerItem, parsed.blanks.length), explanation };
    }
    case "STRIKE_OUT": {
      const phrases = ((raw.phrases as { text: string; belongs: boolean }[]) ?? []).filter((p) => String(p.text ?? "").trim()).map((p) => ({ id: nid("p"), text: String(p.text).trim(), belongs: Boolean(p.belongs) }));
      return {
        content: { topicText: String(raw.topicText ?? "").trim(), phrases: phrases.map(({ id, text }) => ({ id, text })) },
        correct: { strikeIds: phrases.filter((p) => !p.belongs).map((p) => p.id) },
        maxPoints: Math.max(pointsPerItem, phrases.length),
        explanation,
      };
    }
  }
}

export type GeneratedTask = { title: string; instructions: string; items: EditorItem[]; warnings: string[] };

// Convierte y valida. Los ítems que no pasan la validación se descartan con un aviso para el docente.
export function buildTask(type: TaskTypeName, data: unknown, pointsPerItem = 1): GeneratedTask {
  const d = (data ?? {}) as { title?: string; instructions?: string; items?: AiItem[]; notes?: string[] };
  const warnings = (d.notes ?? []).map(String).filter((n) => n.trim());
  const items: EditorItem[] = [];
  (d.items ?? []).forEach((raw, i) => {
    const item = toEditorItem(type, raw, pointsPerItem);
    const problem = itemProblem(type, item);
    if (problem) warnings.push(`Se descartó el ítem ${i + 1}: ${problem}`);
    else items.push(item);
  });
  if (items.length === 0) items.push(emptyItem(type));
  return { title: String(d.title ?? "").trim().slice(0, 120) || "Tarea sin título", instructions: String(d.instructions ?? "").trim().slice(0, 2000) || "Resolvé cada pregunta.", items, warnings };
}

// ---------- Leer una foto ----------

export type Extraction = { detectedType: TaskTypeName | null; confidence: number; title: string; instructions: string; text: string; hasAnswers: boolean; notes: string[] };

const TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "MATCHING", "FILL_BLANKS", "STRIKE_OUT", "OTHER"];

export async function extractFromImages(images: { mimeType: string; base64: string }[]): Promise<{ extraction: Extraction; usage: GeminiUsage }> {
  const parts: GeminiPart[] = [
    ...images.map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.base64 } })),
    {
      text: `Transcribí con fidelidad el ejercicio de la imagen (incluido texto manuscrito legible) y clasificá qué tipo de ejercicio es:
MULTIPLE_CHOICE (preguntas con opciones), TRUE_FALSE (verdadero o falso), MATCHING (unir con flechas dos columnas), FILL_BLANKS (completar espacios en un texto), STRIKE_OUT (tachar lo que no corresponde) u OTHER (ninguno de estos).
confidence va de 0 a 1. hasAnswers es true si el ejercicio ya muestra las respuestas marcadas o resueltas.
En text poné la transcripción completa, respetando el orden y los renglones. Si algo no se lee, escribí [ilegible] y anotalo en notes.`,
    },
  ];
  const schema = obj({ detectedType: { type: "STRING", enum: TYPES }, confidence: N, title: S, instructions: S, text: S, hasAnswers: B, notes: arr(S) });
  const { data, usage } = await generateJson({ system: SYSTEM, parts, schema, temperature: 0.1 });
  const d = data as Omit<Extraction, "detectedType"> & { detectedType: string };
  return {
    extraction: {
      detectedType: d.detectedType && d.detectedType !== "OTHER" ? (d.detectedType as TaskTypeName) : null,
      confidence: Math.max(0, Math.min(1, Number(d.confidence) || 0)),
      title: String(d.title ?? ""),
      instructions: String(d.instructions ?? ""),
      text: String(d.text ?? ""),
      hasAnswers: Boolean(d.hasAnswers),
      notes: (d.notes ?? []).map(String),
    },
    usage,
  };
}

// Arma la tarea a partir de lo transcripto (más las imágenes, para no perder lo que esté marcado).
export async function structureFromPhoto(
  type: TaskTypeName,
  extraction: Extraction,
  images: { mimeType: string; base64: string }[],
  solve: boolean,
): Promise<{ task: GeneratedTask; usage: GeminiUsage }> {
  const parts: GeminiPart[] = [
    ...images.map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.base64 } })),
    {
      text: `Convertí este ejercicio en una tarea de tipo ${type}. ${typeRules[type]}
Respetá el contenido del ejercicio original: no agregues preguntas que no estén.
${extraction.hasAnswers ? "Las respuestas están marcadas en la imagen: usalas." : solve ? "El ejercicio no trae las respuestas: resolvelo vos con cuidado y anotá en notes que las respuestas las propuso la IA." : "El ejercicio no trae las respuestas: elegí la más probable y anotá en notes que hay que revisarlas."}
Transcripción de referencia:
${extraction.text}`,
    },
  ];
  const { data, usage } = await generateJson({ system: SYSTEM, parts, schema: taskSchema(type), temperature: 0.2 });
  const task = buildTask(type, data);
  task.warnings.unshift(...extraction.notes.filter((n) => !task.warnings.includes(n)));
  return { task, usage };
}

// ---------- Generar desde un texto ----------

export type GenerationParams = {
  type: TaskTypeName;
  text: string;
  questions: number; // cantidad de ítems
  elements: number; // opciones, parejas, huecos o frases por ítem
  correctPerItem: number; // solo múltiple choice
  distractors: number; // solo unir
  simpleLanguage: boolean;
  level: string; // por ejemplo "4° grado" o "2° año"
  justification: boolean; // solo verdadero o falso
};

function elementsRule(p: GenerationParams): string {
  switch (p.type) {
    case "MULTIPLE_CHOICE":
      return `Cada pregunta tiene exactamente ${p.elements} opciones, de las cuales ${p.correctPerItem} ${p.correctPerItem === 1 ? "es correcta" : "son correctas"}.`;
    case "TRUE_FALSE":
      return p.justification ? "En cada afirmación pedí justificación (requireJustification=true) y escribí la justificación esperada." : "No pidas justificación (requireJustification=false).";
    case "MATCHING":
      return `Cada ítem tiene exactamente ${p.elements} parejas y ${p.distractors} distractores.`;
    case "FILL_BLANKS":
      return `Cada ítem es un párrafo breve con exactamente ${p.elements} huecos.`;
    case "STRIKE_OUT":
      return `Cada ítem tiene exactamente ${p.elements} frases; entre un tercio y la mitad no corresponden.`;
  }
}

export async function generateFromText(p: GenerationParams): Promise<{ task: GeneratedTask; usage: GeminiUsage }> {
  const parts: GeminiPart[] = [
    {
      text: `Generá una tarea de tipo ${p.type} con exactamente ${p.questions} ${p.questions === 1 ? "ítem" : "ítems"}, para alumnos de ${p.level || "nivel primario o secundario"}.
${typeRules[p.type]}
${elementsRule(p)}
${p.simpleLanguage ? "Usá lenguaje simple: oraciones cortas, una idea por oración, sin dobles negaciones." : ""}
Basate solo en el texto fuente: no uses datos que no estén en el texto. Las respuestas correctas tienen que poder justificarse con el texto.
Texto fuente:
"""
${p.text}
"""`,
    },
  ];
  const { data, usage } = await generateJson({ system: SYSTEM, parts, schema: taskSchema(p.type), temperature: 0.5 });
  return { task: buildTask(p.type, data), usage };
}

// Solo transcribir (para usar una foto como texto fuente).
export async function transcribe(images: { mimeType: string; base64: string }[]): Promise<{ text: string; usage: GeminiUsage }> {
  const { extraction, usage } = await extractFromImages(images);
  return { text: extraction.text, usage };
}
