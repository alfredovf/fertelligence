import type { Prisma, TaskType } from "@prisma/client";
import { z } from "zod";
import { geminiConfigured, type GeminiUsage } from "../ai/gemini";
import { extractFromImages, generateFromText, structureFromPhoto, transcribe, type GeneratedTask } from "../ai/task-ai";
import { audit } from "../audit";
import type { SessionUser } from "../auth/session";
import { prisma } from "../db";
import { readFile } from "../files";
import { getBoss, QUEUES } from "../queue";
import type { TaskTypeName } from "../task-types";

// Trabajos de IA: el pedido se registra en ai_jobs, el worker lo procesa y deja una tarea en borrador
// para que el docente la revise. Cada llamada suma su costo; al llegar al tope mensual se pausan.

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

const TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "MATCHING", "FILL_BLANKS", "STRIKE_OUT"] as const;

// Primer día del mes en hora de Argentina (UTC-3).
function monthStart(now = new Date()): Date {
  const local = new Date(now.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 3));
}

export async function aiBudget() {
  const [settings, agg] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: 1 } }),
    prisma.aiJob.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gte: monthStart() } } }),
  ]);
  const budget = Number(settings?.aiMonthlyBudgetUsd ?? 50);
  const spent = Number(agg._sum.costUsd ?? 0);
  return { budget, spent: Math.round(spent * 100) / 100, percent: budget > 0 ? Math.round((spent / budget) * 100) : 100, blocked: spent >= budget, configured: geminiConfigured() };
}

export async function aiAvailability(): Promise<{ available: boolean; reason?: string }> {
  const b = await aiBudget();
  if (!b.configured) return { available: false, reason: "La inteligencia artificial no está configurada en esta escuela." };
  if (b.blocked) return { available: false, reason: `Se alcanzó el tope mensual de inteligencia artificial (USD ${b.budget}). Vuelve a estar disponible el 1° del mes que viene. Mientras tanto podés usar el formulario.` };
  return { available: true };
}

// Avisa a la administración una vez por mes cuando el gasto pasa el 80 %.
async function maybeWarnBudget() {
  const b = await aiBudget();
  if (b.percent < 80) return;
  const kind = b.blocked ? "ai.budget_reached" : "ai.budget_80";
  const already = await prisma.notification.count({ where: { kind, createdAt: { gte: monthStart() } } });
  if (already) return;
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { id: true } });
  await prisma.notification.createMany({ data: admins.map((a) => ({ userId: a.id, kind, payload: { spent: b.spent, budget: b.budget } })) });
}

// ---------- Pedidos ----------

const photoInput = z.object({
  teacherId: z.string().uuid(),
  subjectId: z.string().uuid("Elegí la materia."),
  type: z.enum(TYPES).nullable(),
  fileIds: z.array(z.string().uuid()).min(1, "Subí al menos una foto.").max(3, "Podés subir hasta 3 fotos."),
  solve: z.boolean(),
});

const textInput = z.object({
  teacherId: z.string().uuid(),
  subjectId: z.string().uuid("Elegí la materia."),
  type: z.enum(TYPES),
  text: z.string().trim().min(80, "El texto es muy corto: escribí al menos un párrafo (80 caracteres).").max(20_000, "El texto es demasiado largo (máximo 20.000 caracteres)."),
  questions: z.coerce.number().int().min(1).max(15),
  elements: z.coerce.number().int().min(2).max(10),
  correctPerItem: z.coerce.number().int().min(1).max(5),
  distractors: z.coerce.number().int().min(0).max(4),
  simpleLanguage: z.boolean(),
  justification: z.boolean(),
  level: z.string().trim().max(40),
});

async function checkTeacher(actor: SessionUser, teacherId: string, subjectId: string): Promise<string | null> {
  if (actor.role === "TEACHER" && actor.id !== teacherId) return "No tenés permiso para hacer esto.";
  const teaches = await prisma.teacherSubject.findUnique({ where: { teacherId_subjectId: { teacherId, subjectId } } });
  return teaches ? null : "Esa materia no está entre las que dicta el docente.";
}

async function enqueueJob(actor: SessionUser, kind: "OCR" | "GENERATE", input: object): Promise<Result<{ jobId: string }>> {
  const availability = await aiAvailability();
  if (!availability.available) return fail(availability.reason!);
  const job = await prisma.aiJob.create({ data: { kind, requestedById: actor.id, input: input as Prisma.InputJsonValue } });
  const boss = await getBoss();
  await boss.send(QUEUES.ai, { jobId: job.id }, { retryLimit: 0, expireInSeconds: 600 });
  return ok({ jobId: job.id });
}

export async function requestTaskFromPhoto(actor: SessionUser, raw: unknown): Promise<Result<{ jobId: string }>> {
  const parsed = photoInput.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisá los datos.");
  const problem = await checkTeacher(actor, parsed.data.teacherId, parsed.data.subjectId);
  if (problem) return fail(problem);
  return enqueueJob(actor, "OCR", parsed.data);
}

export async function requestTaskFromText(actor: SessionUser, raw: unknown): Promise<Result<{ jobId: string }>> {
  const parsed = textInput.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisá los datos.");
  const problem = await checkTeacher(actor, parsed.data.teacherId, parsed.data.subjectId);
  if (problem) return fail(problem);
  return enqueueJob(actor, "GENERATE", parsed.data);
}

async function loadImages(fileIds: string[]) {
  const images: { mimeType: string; base64: string }[] = [];
  for (const id of fileIds) {
    const result = await readFile(id);
    if (!result?.body) throw new Error("No se encontró una de las fotos.");
    const bytes = await result.body.transformToByteArray();
    images.push({ mimeType: result.file.mimeType, base64: Buffer.from(bytes).toString("base64") });
  }
  return images;
}

// Transcripción inmediata (para usar una foto como texto fuente). Registra el costo como un trabajo más.
export async function transcribePhotos(actor: SessionUser, fileIds: string[]): Promise<Result<{ text: string }>> {
  const availability = await aiAvailability();
  if (!availability.available) return fail(availability.reason!);
  const job = await prisma.aiJob.create({ data: { kind: "OCR", requestedById: actor.id, status: "RUNNING", input: { mode: "transcribe", fileIds } } });
  try {
    const { text, usage } = await transcribe(await loadImages(fileIds));
    await finishJob(job.id, "SUCCEEDED", usage, { chars: text.length });
    return ok({ text });
  } catch (error) {
    await finishJob(job.id, "FAILED", (error as { usage?: GeminiUsage }).usage, null, error);
    return fail("No pudimos leer la foto. Probá con otra con mejor luz, o escribí el texto.");
  }
}

async function finishJob(jobId: string, status: "SUCCEEDED" | "FAILED", usage: Partial<GeminiUsage> | undefined, output: object | null, error?: unknown) {
  await prisma.aiJob.update({
    where: { id: jobId },
    data: {
      status,
      finishedAt: new Date(),
      model: usage?.model ?? null,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      costUsd: usage?.costUsd ?? 0,
      output: (output ?? undefined) as Prisma.InputJsonValue | undefined,
      error: error ? (error instanceof Error ? error.message : String(error)).slice(0, 1000) : null,
    },
  });
  await maybeWarnBudget();
}

function addUsage(a: GeminiUsage | undefined, b: GeminiUsage): GeminiUsage {
  if (!a) return b;
  return { model: b.model, inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, costUsd: Math.round((a.costUsd + b.costUsd) * 10_000) / 10_000 };
}

// Crea la tarea en borrador a nombre del docente (y en su nombre si la pidió un administrador).
async function createDraft(job: { id: string; requestedById: string }, teacherId: string, subjectId: string, type: TaskTypeName, origin: "PHOTO" | "TEXT", task: GeneratedTask, fileIds: string[]) {
  const onBehalf = job.requestedById !== teacherId;
  const template = await prisma.taskTemplate.create({
    data: {
      title: task.title,
      instructions: task.instructions,
      subjectId,
      type: type as TaskType,
      origin,
      settings: { shuffle: true, redoScope: "INCORRECT_ONLY" },
      createdById: job.requestedById,
      onBehalfOfId: onBehalf ? teacherId : null,
      items: {
        create: task.items.map((item, position) => ({
          position,
          content: item.content as Prisma.InputJsonValue,
          correctAnswer: item.correct as Prisma.InputJsonValue,
          maxPoints: item.maxPoints,
          explanation: item.explanation || null,
        })),
      },
      sources: { create: fileIds.map((fileId) => ({ fileId })) },
    },
  });
  await audit({ actorId: job.requestedById, onBehalfOfId: onBehalf ? teacherId : null, action: origin === "PHOTO" ? "task.create_from_photo" : "task.create_from_text", entity: "task_template", entityId: template.id, after: { items: task.items.length, aiJob: job.id } });
  return template.id;
}

// Lo corre el worker.
export async function runAiJob(jobId: string): Promise<void> {
  const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "QUEUED") return;
  await prisma.aiJob.update({ where: { id: jobId }, data: { status: "RUNNING" } });
  let usage: GeminiUsage | undefined;
  try {
    if (job.kind === "OCR") {
      const input = photoInput.parse(job.input);
      const images = await loadImages(input.fileIds);
      const step1 = await extractFromImages(images);
      usage = addUsage(usage, step1.usage);
      const type = input.type ?? step1.extraction.detectedType;
      if (!type) {
        await finishJob(jobId, "FAILED", usage, { text: step1.extraction.text }, new Error("No reconocimos el tipo de ejercicio. Elegí el tipo a mano y probá de nuevo, o usá el texto como fuente."));
        return;
      }
      const step2 = await structureFromPhoto(type, step1.extraction, images, input.solve);
      usage = addUsage(usage, step2.usage);
      const templateId = await createDraft(job, input.teacherId, input.subjectId, type, "PHOTO", step2.task, input.fileIds);
      await finishJob(jobId, "SUCCEEDED", usage, { templateId, type, detectedType: step1.extraction.detectedType, confidence: step1.extraction.confidence, warnings: step2.task.warnings });
    } else if (job.kind === "GENERATE") {
      const input = textInput.parse(job.input);
      const result = await generateFromText(input);
      usage = result.usage;
      const templateId = await createDraft(job, input.teacherId, input.subjectId, input.type, "TEXT", result.task, []);
      await finishJob(jobId, "SUCCEEDED", usage, { templateId, type: input.type, warnings: result.task.warnings });
    } else {
      await finishJob(jobId, "FAILED", usage, null, new Error("Tipo de trabajo no soportado todavía."));
    }
  } catch (error) {
    usage = addUsage(usage, { model: "", inputTokens: 0, outputTokens: 0, costUsd: 0, ...((error as { usage?: GeminiUsage }).usage ?? {}) });
    await finishJob(jobId, "FAILED", usage, null, error);
  }
}

export async function loadJobFor(user: SessionUser, jobId: string) {
  const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
  if (!job || (user.role !== "ADMIN" && job.requestedById !== user.id)) return null;
  return job;
}

// Mensaje para el docente cuando un trabajo falla (sin detalles técnicos).
export function friendlyError(error: string | null): string {
  if (!error) return "No se pudo completar. Probá de nuevo.";
  if (error.includes("tipo de ejercicio")) return error;
  if (error.includes("tope")) return error;
  if (/free_tier|quota/i.test(error)) return "Se agotó el cupo del servicio de inteligencia artificial. Si la clave está en el nivel gratuito, la administración tiene que activar la facturación en Google Cloud.";
  if (error.includes("503") || error.includes("429") || error.includes("conectar")) return "El servicio de inteligencia artificial está muy ocupado en este momento. Probá de nuevo en unos minutos.";
  if (error.includes("bloqueado")) return "El contenido fue rechazado por los filtros de seguridad. Revisá la foto o el texto.";
  return "No pudimos armar la tarea. Probá de nuevo, con otra foto o con otro texto.";
}
