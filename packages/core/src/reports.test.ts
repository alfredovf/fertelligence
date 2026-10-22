import { describe, expect, it } from "vitest";
import { toCsv } from "./services/reports";

describe("toCsv", () => {
  it("usa punto y coma, coma decimal, BOM y escapa comillas", () => {
    const csv = toCsv(["Nombre", "Nota"], [["Ana \"la\" profe; 4° B", 9.5], ["Bruno", null]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('Nombre;Nota\n"Ana ""la"" profe; 4° B";9,5\nBruno;\n');
  });
});
