import { describe, expect, it } from "vitest";
import { parseAttachments } from "./google/classroom";
import { decrypt, encrypt } from "./google/tokens";
import { mapFormToTask } from "./services/classroom";

describe("cuestionario de Google Forms", () => {
  const form = {
    formId: "f1",
    info: { title: "Estados del agua", description: "Elegí la correcta." },
    items: [
      {
        itemId: "1",
        title: "¿En qué estado está el hielo?",
        questionItem: { question: { choiceQuestion: { type: "RADIO" as const, options: [{ value: "Sólido" }, { value: "Líquido" }, { value: "Gaseoso" }] }, grading: { pointValue: 2, correctAnswers: { answers: [{ value: "Sólido" }] }, whenRight: { text: "El hielo es agua sólida." } } } },
      },
      {
        itemId: "2",
        title: "Estados del agua (varias)",
        questionItem: { question: { choiceQuestion: { type: "CHECKBOX" as const, options: [{ value: "Sólido" }, { value: "Arena" }, { value: "Gaseoso" }, { isOther: true }] }, grading: { pointValue: 2, correctAnswers: { answers: [{ value: "Sólido" }, { value: "Gaseoso" }] } } } },
      },
      { itemId: "3", title: "Explicá la evaporación", questionItem: { question: { textQuestion: {} } } },
      { itemId: "4", title: "Sin respuesta marcada", questionItem: { question: { choiceQuestion: { type: "RADIO" as const, options: [{ value: "A" }, { value: "B" }] } } } },
      { itemId: "5", title: "Una sección" },
    ],
  };

  it("convierte las preguntas con respuesta y omite las demás con aviso", () => {
    const m = mapFormToTask(form);
    expect(m.title).toBe("Estados del agua");
    expect(m.items).toHaveLength(2);
    expect(m.items[0]!.maxPoints).toBe(2);
    expect(m.items[0]!.explanation).toBe("El hielo es agua sólida.");
    expect((m.items[1]!.content as { multiple: boolean; options: unknown[] }).multiple).toBe(true);
    expect((m.items[1]!.content as { options: unknown[] }).options).toHaveLength(3); // sin la opción "Otro"
    expect(m.skipped.map((s) => s.title)).toEqual(["Explicá la evaporación", "Sin respuesta marcada"]);
  });
});

describe("adjuntos de Classroom", () => {
  it("reconoce archivos de Drive, cuestionarios y enlaces", () => {
    const a = parseAttachments([
      { driveFile: { driveFile: { id: "d1", title: "Ficha.pdf" } } },
      { form: { formUrl: "https://docs.google.com/forms/d/abc123_XY/edit", title: "Quiz" } },
      { link: { url: "https://example.com", title: "Lectura" } },
      { youtubeVideo: { title: "Video" } },
    ]);
    expect(a).toEqual([
      { kind: "drive", fileId: "d1", title: "Ficha.pdf" },
      { kind: "form", formId: "abc123_XY", title: "Quiz" },
      { kind: "link", url: "https://example.com", title: "Lectura" },
    ]);
  });
});

describe("tokens cifrados", () => {
  it("cifra y descifra; no se puede alterar", () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const sealed = encrypt("refresh-token-de-prueba");
    expect(sealed).not.toContain("refresh-token");
    expect(decrypt(sealed)).toBe("refresh-token-de-prueba");
    const parts = sealed.split(".");
    const tampered = [parts[0], parts[1], Buffer.from("otro").toString("base64")].join(".");
    expect(() => decrypt(tampered)).toThrow();
  });
});
