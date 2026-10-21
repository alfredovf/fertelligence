import { describe, expect, it } from "vitest";
import { detectMime } from "./files";
import { hashPassword, passwordProblem, verifyPassword } from "./auth/password";
import { randomToken, sha256 } from "./auth/crypto";
import { consentStatements } from "./services/consent";

describe("contraseñas", () => {
  it("exige al menos 10 caracteres", () => {
    expect(passwordProblem("corta")).toMatch(/10 caracteres/);
    expect(passwordProblem("suficientemente-larga")).toBeNull();
  });

  it("verifica el hash y rechaza otra contraseña", async () => {
    const hash = await hashPassword("una-contraseña-segura");
    expect(await verifyPassword(hash, "una-contraseña-segura")).toBe(true);
    expect(await verifyPassword(hash, "otra-contraseña")).toBe(false);
    expect(await verifyPassword("no-es-un-hash", "x")).toBe(false);
  });
});

describe("tokens", () => {
  it("son distintos y se guardan como hash", () => {
    const a = randomToken();
    expect(a).not.toBe(randomToken());
    expect(sha256(a)).toHaveLength(64);
    expect(sha256(a)).not.toContain(a);
  });
});

describe("archivos", () => {
  it("reconoce el formato por el contenido, no por la extensión", () => {
    expect(detectMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
    expect(detectMime(Buffer.from("%PDF-1.7 ..."))).toBe("application/pdf");
    expect(detectMime(Buffer.from("<script>alert(1)</script>"))).toBeNull();
  });
});

describe("consentimiento", () => {
  it("tiene las cuatro declaraciones con el nombre del alumno", () => {
    const statements = consentStatements("Tomás Ramírez", "Escuela N° 1");
    expect(statements).toHaveLength(4);
    expect(statements[0]).toContain("Tomás Ramírez");
    expect(statements[2]).toMatch(/transferencia internacional/);
  });
});
