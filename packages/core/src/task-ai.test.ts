import { describe, expect, it } from "vitest";
import { costOf, priceFor } from "./ai/gemini";
import { buildTask } from "./ai/task-ai";

describe("conversión de la respuesta de la IA", () => {
  it("múltiple choice: arma ids y detecta varias correctas", () => {
    const task = buildTask("MULTIPLE_CHOICE", {
      title: "Agua",
      instructions: "Elegí.",
      notes: [],
      items: [{ question: "¿Estados del agua?", options: [{ text: "Sólido", correct: true }, { text: "Gaseoso", correct: true }, { text: "Arena", correct: false }], explanation: "Hay tres estados." }],
    });
    expect(task.items).toHaveLength(1);
    const c = task.items[0]!.content as { multiple: boolean; options: { id: string }[] };
    expect(c.multiple).toBe(true);
    expect((task.items[0]!.correct as { optionIds: string[] }).optionIds).toHaveLength(2);
    expect(task.warnings).toEqual([]);
  });

  it("descarta ítems inválidos con un aviso", () => {
    const task = buildTask("MULTIPLE_CHOICE", { title: "X", instructions: "Y", notes: ["Revisar la 2"], items: [{ question: "¿?", options: [{ text: "A", correct: false }, { text: "B", correct: false }] }] });
    expect(task.warnings[0]).toBe("Revisar la 2");
    expect(task.warnings[1]).toMatch(/Se descartó el ítem 1/);
    expect(task.items).toHaveLength(1); // queda un ítem vacío para completar a mano
  });

  it("completar y tachar", () => {
    const fill = buildTask("FILL_BLANKS", { title: "t", instructions: "i", notes: [], items: [{ text: "Pasa a estado [[gaseoso]] por [[evaporación|vaporización]].", explanation: "" }] });
    expect((fill.items[0]!.correct as { answers: Record<string, string[]> }).answers).toEqual({ b1: ["gaseoso"], b2: ["evaporación", "vaporización"] });
    const strike = buildTask("STRIKE_OUT", { title: "t", instructions: "i", notes: [], items: [{ topicText: "Mamíferos", phrases: [{ text: "Pelo", belongs: true }, { text: "Branquias", belongs: false }], explanation: "" }] });
    expect((strike.items[0]!.correct as { strikeIds: string[] }).strikeIds).toHaveLength(1);
  });

  it("unir: parejas y distractores", () => {
    const task = buildTask("MATCHING", { title: "t", instructions: "i", notes: [], items: [{ pairs: [{ left: "Pez", right: "Nada" }, { left: "Ave", right: "Vuela" }], distractors: ["Repta"], explanation: "" }] });
    const c = task.items[0]!.content as { left: unknown[]; right: unknown[] };
    expect(c.left).toHaveLength(2);
    expect(c.right).toHaveLength(3);
  });
});

describe("costo de Gemini", () => {
  it("usa el precio vigente según la fecha", () => {
    expect(priceFor("gemini-3.8-flash", new Date("2026-10-21"))).toEqual({ from: "2026-01-01", input: 0.75, output: 3.75 });
    expect(priceFor("gemini-3.8-flash", new Date("2027-02-01")).input).toBe(1.5);
    expect(costOf("gemini-3.8-flash", 1_000_000, 1_000_000, new Date("2026-10-21"))).toBe(4.5);
  });

  it("modelo desconocido: precio prudente", () => {
    expect(priceFor("modelo-nuevo").output).toBe(10);
  });
});
