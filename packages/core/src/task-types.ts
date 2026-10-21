import { z } from "zod";

// Forma del contenido, la clave de corrección y la respuesta de cada tipo de tarea.
// Se usan para validar lo que carga el docente, lo que devuelve la IA y lo que responde el alumno.

const id = z.string().min(1);
const option = z.object({ id, text: z.string(), imageFileId: z.string().uuid().optional() });

export const multipleChoice = {
  content: z.object({
    question: z.string().min(1),
    multiple: z.boolean().default(false), // varias respuestas correctas
    options: z.array(option).min(2),
  }),
  correct: z.object({ optionIds: z.array(id).min(1) }),
  response: z.object({ optionIds: z.array(id) }),
};

export const trueFalse = {
  content: z.object({
    statement: z.string().min(1),
    requireJustification: z.boolean().default(false),
    justificationPoints: z.number().nonnegative().default(0), // parte del puntaje que corrige el docente
  }),
  correct: z.object({ value: z.boolean(), expectedJustification: z.string().optional() }),
  response: z.object({ value: z.boolean().nullable(), justification: z.string().optional() }),
};

export const matching = {
  content: z.object({
    left: z.array(option).min(2),
    right: z.array(option).min(2), // puede tener distractores sin pareja
  }),
  correct: z.object({ pairs: z.array(z.tuple([id, id])).min(1) }),
  response: z.object({ pairs: z.array(z.tuple([id, id])) }),
};

export const fillBlanks = {
  content: z.object({
    text: z.string().min(1), // los huecos se marcan como {{id}}
    blanks: z.array(z.object({ id })).min(1),
    wordBank: z.array(z.string()).optional(),
    requireAccents: z.boolean().default(false),
  }),
  correct: z.object({ answers: z.record(id, z.array(z.string().min(1)).min(1)) }),
  response: z.object({ answers: z.record(id, z.string()) }),
};

export const strikeOut = {
  content: z.object({
    topicText: z.string().min(1),
    phrases: z.array(option).min(2),
  }),
  correct: z.object({ strikeIds: z.array(id) }),
  response: z.object({ strikeIds: z.array(id) }),
};

export const taskTypeSchemas = {
  MULTIPLE_CHOICE: multipleChoice,
  TRUE_FALSE: trueFalse,
  MATCHING: matching,
  FILL_BLANKS: fillBlanks,
  STRIKE_OUT: strikeOut,
} as const;

export type TaskTypeName = keyof typeof taskTypeSchemas;

export const taskTypeLabels: Record<TaskTypeName, string> = {
  MULTIPLE_CHOICE: "Múltiple choice",
  TRUE_FALSE: "Verdadero o falso",
  MATCHING: "Unir con flechas",
  FILL_BLANKS: "Completar",
  STRIKE_OUT: "Tachar lo que no corresponde",
};
