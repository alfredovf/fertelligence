import { hash, verify } from "@node-rs/argon2";

export const PASSWORD_MIN_LENGTH = 10;

// argon2id con los parámetros recomendados por OWASP (19 MiB, 2 iteraciones).
const options = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `La contraseña tiene que tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (password.length > 200) return "La contraseña es demasiado larga.";
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, options);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
