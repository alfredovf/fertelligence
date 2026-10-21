import { describe, expect, it } from "vitest";
import { isAnswered, readPreferences, streakFrom } from "./services/attempts";

const at = (iso: string) => new Date(iso);

describe("racha", () => {
  it("cuenta días seguidos con entregas, en hora de Argentina", () => {
    const now = at("2026-10-21T15:00:00-03:00");
    expect(streakFrom([at("2026-10-21T10:00:00-03:00"), at("2026-10-20T22:00:00-03:00"), at("2026-10-19T09:00:00-03:00")], now)).toBe(3);
  });

  it("si hoy todavía no entregó, cuenta desde ayer", () => {
    const now = at("2026-10-21T08:00:00-03:00");
    expect(streakFrom([at("2026-10-20T10:00:00-03:00"), at("2026-10-19T10:00:00-03:00")], now)).toBe(2);
  });

  it("se corta con un día sin entregas", () => {
    const now = at("2026-10-21T15:00:00-03:00");
    expect(streakFrom([at("2026-10-21T10:00:00-03:00"), at("2026-10-19T10:00:00-03:00")], now)).toBe(1);
    expect(streakFrom([], now)).toBe(0);
  });

  it("una entrega a las 23:30 de Argentina cuenta para ese día", () => {
    const now = at("2026-10-21T12:00:00-03:00");
    expect(streakFrom([at("2026-10-20T23:30:00-03:00"), at("2026-10-21T09:00:00-03:00")], now)).toBe(2);
  });
});

describe("respuesta completa", () => {
  it("según el tipo", () => {
    expect(isAnswered("MULTIPLE_CHOICE", {}, { optionIds: [] })).toBe(false);
    expect(isAnswered("MULTIPLE_CHOICE", {}, { optionIds: ["a"] })).toBe(true);
    expect(isAnswered("TRUE_FALSE", {}, { value: null })).toBe(false);
    expect(isAnswered("TRUE_FALSE", {}, { value: false })).toBe(true);
    expect(isAnswered("MATCHING", { left: [{}, {}] }, { pairs: [["l1", "r1"]] })).toBe(false);
    expect(isAnswered("FILL_BLANKS", { blanks: [{ id: "b1" }, { id: "b2" }] }, { answers: { b1: "x", b2: " " } })).toBe(false);
    expect(isAnswered("STRIKE_OUT", {}, { strikeIds: [] })).toBe(true);
    expect(isAnswered("STRIKE_OUT", {}, null)).toBe(false);
  });
});

describe("preferencias", () => {
  it("usa valores por defecto si faltan o son inválidas", () => {
    expect(readPreferences(undefined).fontSize).toBe("normal");
    expect(readPreferences({ fontSize: "gigante" }).pauseReminders).toBe(true);
    expect(readPreferences({ fontSize: "large", autoRead: true })).toMatchObject({ fontSize: "large", autoRead: true });
  });
});
