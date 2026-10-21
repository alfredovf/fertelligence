import { prisma } from "../db";
import { env } from "../env";
import type { EmailMessage } from "./templates";

// Envía un email con Resend. Sin RESEND_API_KEY lo escribe en el log (útil en desarrollo).
export async function sendEmail(message: EmailMessage): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email] (sin RESEND_API_KEY, no se envía) Para: ${message.to} · ${message.subject}\n${message.text}`);
    await prisma.emailLog.create({ data: { to: message.to, template: message.template, status: "logged" } });
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.mailFrom, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
  });
  const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  await prisma.emailLog.create({ data: { to: message.to, template: message.template, resendId: body.id ?? null, status: response.ok ? "sent" : `error ${response.status}` } });
  if (!response.ok) throw new Error(`Resend respondió ${response.status}: ${body.message ?? "sin detalle"}`);
}
