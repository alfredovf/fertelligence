// Cliente mínimo de la API de Gemini (REST). Pide JSON con un esquema, reintenta errores temporales,
// cae a un modelo alternativo si el principal está saturado y calcula el costo de cada llamada.

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

export type GeminiUsage = { inputTokens: number; outputTokens: number; model: string; costUsd: number };

export class AiError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

// USD por millón de tokens (nivel pago estándar). La salida incluye los tokens de razonamiento.
// Fuente: https://ai.google.dev/gemini-api/docs/pricing (consultado el 21/10/2026).
const PRICES: Record<string, { from: string; input: number; output: number }[]> = {
  "gemini-3.8-flash": [
    { from: "2026-01-01", input: 0.75, output: 3.75 },
    { from: "2027-01-01", input: 1.5, output: 7.5 },
  ],
  "gemini-3.6-flash": [
    { from: "2026-01-01", input: 0.75, output: 3.75 },
    { from: "2027-01-01", input: 1.5, output: 7.5 },
  ],
  "gemini-3.5-flash-lite": [{ from: "2026-01-01", input: 0.3, output: 2.5 }],
  "gemini-3.1-flash-lite": [{ from: "2026-01-01", input: 0.25, output: 1.5 }],
};

export function priceFor(model: string, at = new Date()): { input: number; output: number } {
  const envIn = Number(process.env.GEMINI_PRICE_INPUT_PER_MTOK);
  const envOut = Number(process.env.GEMINI_PRICE_OUTPUT_PER_MTOK);
  if (envIn > 0 && envOut > 0) return { input: envIn, output: envOut };
  const table = PRICES[model];
  if (!table) return { input: 2, output: 10 }; // modelo desconocido: precio prudente para no pasarse del tope
  const day = at.toISOString().slice(0, 10);
  return [...table].reverse().find((p) => p.from <= day) ?? table[0]!;
}

export function costOf(model: string, inputTokens: number, outputTokens: number, at = new Date()): number {
  const p = priceFor(model, at);
  return Math.round(((inputTokens * p.input + outputTokens * p.output) / 1_000_000) * 10_000) / 10_000;
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

// Modelo principal y alternativos, en orden (GEMINI_FALLBACK_MODEL acepta varios separados por coma).
function models(): string[] {
  const primary = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  const fallbacks = (process.env.GEMINI_FALLBACK_MODEL?.trim() || "gemini-3.6-flash,gemini-3.5-flash-lite").split(",").map((m) => m.trim()).filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callOnce(model: string, body: unknown): Promise<{ json: unknown; usage: GeminiUsage }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new AiError("La inteligencia artificial no está configurada (falta GEMINI_API_KEY).");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new AiError("No se pudo conectar con el servicio de inteligencia artificial.", true);
  } finally {
    clearTimeout(timeout);
  }
  const data = (await response.json().catch(() => ({}))) as {
    error?: { code?: number; message?: string };
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    promptFeedback?: { blockReason?: string };
  };
  if (!response.ok || data.error) {
    const code = data.error?.code ?? response.status;
    const message = data.error?.message ?? "sin detalle";
    // 404: el modelo no está disponible para esta cuenta. 429 con cupo diario agotado: no sirve reintentar ese modelo.
    if (code === 404 || (code === 429 && /quota/i.test(message))) throw Object.assign(new AiError(`Gemini respondió ${code}: ${message}`), { skipModel: true, freeTier: /free_tier/i.test(message) });
    throw new AiError(`Gemini respondió ${code}: ${message}`, [429, 500, 502, 503, 504].includes(code));
  }
  const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0);
  const usage = { inputTokens, outputTokens, model, costUsd: costOf(model, inputTokens, outputTokens) };
  if (data.promptFeedback?.blockReason) throw Object.assign(new AiError("El contenido fue bloqueado por los filtros de seguridad de Gemini."), { usage });
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  try {
    return { json: JSON.parse(text), usage };
  } catch {
    throw Object.assign(new AiError("La respuesta de la inteligencia artificial no se pudo leer.", true), { usage });
  }
}

// Llama al modelo pidiendo JSON según `schema`. Devuelve los datos y el uso acumulado (incluye reintentos fallidos con costo).
export async function generateJson(options: { system: string; parts: GeminiPart[]; schema: unknown; temperature?: number }): Promise<{ data: unknown; usage: GeminiUsage }> {
  const body = {
    systemInstruction: { parts: [{ text: options.system }] },
    contents: [{ role: "user", parts: options.parts }],
    generationConfig: { responseMimeType: "application/json", responseSchema: options.schema, temperature: options.temperature ?? 0.4 },
  };
  const spent = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  let lastError: AiError = new AiError("No se pudo completar el pedido.");
  for (const model of models()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { json, usage } = await callOnce(model, body);
        return { data: json, usage: { ...usage, inputTokens: usage.inputTokens + spent.inputTokens, outputTokens: usage.outputTokens + spent.outputTokens, costUsd: Math.round((usage.costUsd + spent.costUsd) * 10_000) / 10_000 } };
      } catch (error) {
        const e = error instanceof AiError ? error : new AiError(String(error));
        const u = (error as { usage?: GeminiUsage }).usage;
        if (u) {
          spent.inputTokens += u.inputTokens;
          spent.outputTokens += u.outputTokens;
          spent.costUsd += u.costUsd;
        }
        lastError = e;
        if ((error as { skipModel?: boolean }).skipModel) break; // probar con el siguiente modelo
        if (!e.retryable) throw Object.assign(e, { usage: { ...spent, model } });
        await sleep(attempt === 0 ? 3000 : 8000);
      }
    }
  }
  throw Object.assign(lastError, { usage: { ...spent, model: models()[0]! } });
}
