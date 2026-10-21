import { describe, expect, it } from "vitest";
import { isPassing, normalizeText, scoreItem, suggestedGrade } from "./grading";

const mc = (multiple: boolean) => ({
  question: "¿Cuáles son estados del agua?",
  multiple,
  options: [
    { id: "a", text: "Sólido" },
    { id: "b", text: "Líquido" },
    { id: "c", text: "Arena" },
  ],
});

describe("múltiple choice", () => {
  it("respuesta única: todo o nada", () => {
    expect(scoreItem("MULTIPLE_CHOICE", mc(false), { optionIds: ["a"] }, { optionIds: ["a"] }, 2).points).toBe(2);
    expect(scoreItem("MULTIPLE_CHOICE", mc(false), { optionIds: ["a"] }, { optionIds: ["b"] }, 2).points).toBe(0);
  });

  it("varias respuestas: puntaje parcial, cada incorrecta resta, mínimo 0", () => {
    const key = { optionIds: ["a", "b"] };
    expect(scoreItem("MULTIPLE_CHOICE", mc(true), key, { optionIds: ["a", "b"] }, 2).points).toBe(2);
    expect(scoreItem("MULTIPLE_CHOICE", mc(true), key, { optionIds: ["a"] }, 2).points).toBe(1);
    expect(scoreItem("MULTIPLE_CHOICE", mc(true), key, { optionIds: ["a", "c"] }, 2).points).toBe(0);
    expect(scoreItem("MULTIPLE_CHOICE", mc(true), key, { optionIds: ["c"] }, 2).points).toBe(0);
  });
});

describe("verdadero o falso", () => {
  it("con justificación deja esa parte para el docente", () => {
    const content = { statement: "Las nubes son humo", requireJustification: true, justificationPoints: 1 };
    const score = scoreItem("TRUE_FALSE", content, { value: false }, { value: false, justification: "Son agua" }, 2);
    expect(score).toEqual({ points: 1, needsReview: true });
  });
});

describe("unir con flechas", () => {
  it("suma por par correcto", () => {
    const content = {
      left: [{ id: "1", text: "Pez" }, { id: "2", text: "Águila" }],
      right: [{ id: "x", text: "Nada" }, { id: "y", text: "Vuela" }, { id: "z", text: "Repta" }],
    };
    const key = { pairs: [["1", "x"], ["2", "y"]] };
    expect(scoreItem("MATCHING", content, key, { pairs: [["1", "x"], ["2", "z"]] }, 2).points).toBe(1);
  });
});

describe("completar", () => {
  it("acepta sinónimos e ignora mayúsculas y tildes", () => {
    const content = { text: "Se llama {{b1}}.", blanks: [{ id: "b1" }] };
    const key = { answers: { b1: ["evaporación", "vaporización"] } };
    expect(scoreItem("FILL_BLANKS", content, key, { answers: { b1: " Evaporacion " } }, 1).points).toBe(1);
    expect(scoreItem("FILL_BLANKS", content, key, { answers: { b1: "fusión" } }, 1).points).toBe(0);
  });

  it("normaliza texto", () => {
    expect(normalizeText("  Evaporación   del  AGUA ", false)).toBe("evaporacion del agua");
    expect(normalizeText("Evaporación", true)).toBe("evaporación");
  });
});

describe("tachar", () => {
  it("cada frase bien clasificada suma", () => {
    const content = {
      topicText: "Los mamíferos…",
      phrases: [{ id: "p1", text: "Tienen pelo" }, { id: "p2", text: "Ponen huevos" }, { id: "p3", text: "Branquias" }, { id: "p4", text: "Toman leche" }],
    };
    const key = { strikeIds: ["p2", "p3"] };
    expect(scoreItem("STRIKE_OUT", content, key, { strikeIds: ["p2", "p3"] }, 4).points).toBe(4);
    expect(scoreItem("STRIKE_OUT", content, key, { strikeIds: ["p2", "p1"] }, 4).points).toBe(2);
  });
});

describe("nota sugerida", () => {
  it("redondea al entero más cercano y 0,5 sube", () => {
    expect(suggestedGrade([{ points: 6, maxPoints: 8 }])).toBe(8); // 7,5
    expect(suggestedGrade([{ points: 6.4, maxPoints: 10 }])).toBe(6);
    expect(suggestedGrade([{ points: 6.5, maxPoints: 10 }])).toBe(7);
    expect(suggestedGrade([{ points: 0, maxPoints: 10 }])).toBe(0);
    expect(suggestedGrade([])).toBe(0);
  });

  it("aprueba con 7", () => {
    expect(isPassing(7)).toBe(true);
    expect(isPassing(6)).toBe(false);
  });
});
