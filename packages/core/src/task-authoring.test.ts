import { describe, expect, it } from "vitest";
import { emptyItem, itemProblem, parseBlanksMarkup, splitBlanks, toBlanksMarkup } from "./task-authoring";

describe("completar: marcado con corchetes dobles", () => {
  it("convierte [[...]] en huecos con respuestas aceptadas", () => {
    const parsed = parseBlanksMarkup("Pasa a estado [[gaseoso]]. Se llama [[evaporación | vaporización]].");
    expect(parsed.text).toBe("Pasa a estado {{b1}}. Se llama {{b2}}.");
    expect(parsed.blanks).toEqual([{ id: "b1" }, { id: "b2" }]);
    expect(parsed.answers).toEqual({ b1: ["gaseoso"], b2: ["evaporación", "vaporización"] });
    expect(toBlanksMarkup(parsed.text, parsed.answers)).toBe("Pasa a estado [[gaseoso]]. Se llama [[evaporación|vaporización]].");
  });

  it("divide el texto en partes", () => {
    expect(splitBlanks("A {{b1}} C")).toEqual([{ kind: "text", value: "A " }, { kind: "blank", id: "b1" }, { kind: "text", value: " C" }]);
  });
});

describe("validación de ítems", () => {
  it("un ítem vacío no es válido", () => {
    for (const type of ["MULTIPLE_CHOICE", "TRUE_FALSE", "MATCHING", "FILL_BLANKS", "STRIKE_OUT"] as const) {
      expect(itemProblem(type, emptyItem(type))).not.toBeNull();
    }
  });

  it("múltiple choice: exige una correcta si no es de varias respuestas", () => {
    const item = { content: { question: "¿?", multiple: false, options: [{ id: "a", text: "Sí" }, { id: "b", text: "No" }] }, correct: { optionIds: ["a", "b"] }, maxPoints: 1 };
    expect(itemProblem("MULTIPLE_CHOICE", item)).toMatch(/una sola/);
    expect(itemProblem("MULTIPLE_CHOICE", { ...item, correct: { optionIds: ["a"] } })).toBeNull();
  });

  it("verdadero o falso: la justificación vale menos que el ítem", () => {
    const item = { content: { statement: "El sol es una estrella", requireJustification: true, justificationPoints: 2 }, correct: { value: true }, maxPoints: 2 };
    expect(itemProblem("TRUE_FALSE", item)).toMatch(/justificación/);
    expect(itemProblem("TRUE_FALSE", { ...item, maxPoints: 3 })).toBeNull();
  });

  it("unir: cada elemento de la izquierda con una pareja distinta", () => {
    const content = { left: [{ id: "l1", text: "Pez" }, { id: "l2", text: "Ave" }], right: [{ id: "r1", text: "Nada" }, { id: "r2", text: "Vuela" }, { id: "r3", text: "Repta" }] };
    expect(itemProblem("MATCHING", { content, correct: { pairs: [["l1", "r1"], ["l2", "r1"]] }, maxPoints: 2 })).toMatch(/misma pareja/);
    expect(itemProblem("MATCHING", { content, correct: { pairs: [["l1", "r1"], ["l2", "r2"]] }, maxPoints: 2 })).toBeNull();
  });

  it("completar: el texto tiene que tener huecos", () => {
    const ok = parseBlanksMarkup("El agua hierve a [[100]] grados.");
    expect(itemProblem("FILL_BLANKS", { content: { text: ok.text, blanks: ok.blanks }, correct: { answers: ok.answers }, maxPoints: 1 })).toBeNull();
    const none = parseBlanksMarkup("Sin huecos.");
    expect(itemProblem("FILL_BLANKS", { content: { text: none.text, blanks: [{ id: "x" }] }, correct: { answers: { x: ["a"] } }, maxPoints: 1 })).toMatch(/hueco/);
  });

  it("tachar: al menos una para tachar y una que corresponda", () => {
    const content = { topicText: "Mamíferos", phrases: [{ id: "p1", text: "Pelo" }, { id: "p2", text: "Branquias" }] };
    expect(itemProblem("STRIKE_OUT", { content, correct: { strikeIds: [] }, maxPoints: 2 })).toMatch(/al menos una/);
    expect(itemProblem("STRIKE_OUT", { content, correct: { strikeIds: ["p1", "p2"] }, maxPoints: 2 })).toMatch(/quedar/);
    expect(itemProblem("STRIKE_OUT", { content, correct: { strikeIds: ["p2"] }, maxPoints: 2 })).toBeNull();
  });
});
