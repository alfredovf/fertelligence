// Plantillas de email: HTML simple y legible en cualquier cliente, más versión de texto plano.
export type EmailMessage = { to: string; subject: string; html: string; text: string; template: string };

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, paragraphs: string[], button?: { label: string; url: string }, footer?: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px">${escape(p)}</p>`).join("");
  const cta = button
    ? `<p style="margin:22px 0"><a href="${escape(button.url)}" style="background:#3346c8;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px;display:inline-block">${escape(button.label)}</a></p><p style="margin:0 0 14px;font-size:13px;color:#5b6480">Si el botón no funciona, copiá este enlace: ${escape(button.url)}</p>`
    : "";
  const foot = footer ? `<p style="margin:24px 0 0;font-size:12px;color:#5b6480">${escape(footer)}</p>` : "";
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#1b2236;font-size:16px;line-height:1.55"><div style="max-width:560px;margin:0 auto;padding:24px"><div style="font-size:20px;font-weight:bold;margin-bottom:16px">Fert<span style="color:#3346c8">elligence</span></div><div style="background:#ffffff;border:1px solid #dce1eb;border-radius:12px;padding:24px"><h1 style="font-size:20px;margin:0 0 16px">${escape(title)}</h1>${body}${cta}</div>${foot}</div></body></html>`;
}

function text(paragraphs: string[], button?: { label: string; url: string }, footer?: string): string {
  return [...paragraphs, button ? `${button.label}: ${button.url}` : "", footer ?? ""].filter(Boolean).join("\n\n");
}

function build(template: string, to: string, subject: string, title: string, paragraphs: string[], button?: { label: string; url: string }, footer?: string): EmailMessage {
  return { to, subject, template, html: layout(title, paragraphs, button, footer), text: text(paragraphs, button, footer) };
}

export const emails = {
  passwordReset: (to: string, name: string, url: string) =>
    build("password-reset", to, "Crear una contraseña nueva", "Crear una contraseña nueva", [
      `Hola, ${name}:`,
      "Recibimos un pedido para crear una contraseña nueva para tu cuenta de Fertelligence. El enlace vence en 30 minutos.",
    ], { label: "Crear contraseña", url }, "Si no lo pediste, ignorá este email: tu contraseña no cambia."),

  invitation: (to: string, name: string, school: string, url: string) =>
    build("invitation", to, `Tu cuenta de Fertelligence en ${school}`, "Te damos la bienvenida", [
      `Hola, ${name}:`,
      `${school} te creó una cuenta en Fertelligence. Podés entrar con tu cuenta de Google usando este email, o crear una contraseña con el botón. El enlace vence en 7 días.`,
    ], { label: "Crear mi contraseña", url }),

  consentRequest: (p: { to: string; contactName: string; studentName: string; school: string; url: string; expires: string; reminder: boolean }) =>
    build("consent-request", p.to, `${p.reminder ? "Recordatorio: " : ""}Necesitamos tu permiso para que ${p.studentName} use Fertelligence`, "Consentimiento para usar Fertelligence", [
      `Hola, ${p.contactName}:`,
      `En ${p.school} usamos Fertelligence, una plataforma donde los docentes dan tareas cortas y claras, y los alumnos las resuelven desde el celular, la tablet o la computadora.`,
      `Para que ${p.studentName} pueda empezar a usarla necesitamos tu consentimiento como madre, padre o tutor.`,
      "En pocas palabras: guardamos su nombre, curso, email, tareas, respuestas y notas; lo ven solo sus docentes y la escuela; no guardamos datos de salud ni grabamos su voz; usamos servicios de Google, Anthropic y Resend que procesan datos en Estados Unidos; podés retirar el permiso cuando quieras.",
      `El enlace es personal y vence el ${p.expires}. Si tenés preguntas o preferís firmar en papel, comunicate con la escuela.`,
    ], { label: "Leer y dar mi consentimiento", url: p.url }, `Recibiste este mensaje porque ${p.school} registró este email como contacto de ${p.studentName}.`),

  consentReceipt: (p: { to: string; contactName: string; studentName: string; decidedAt: string; version: string; privacyUrl: string }) =>
    build("consent-receipt", p.to, `Copia de tu consentimiento para ${p.studentName}`, "Registramos tu consentimiento", [
      `Hola, ${p.contactName}:`,
      `Registramos tu consentimiento para que ${p.studentName} use Fertelligence, el ${p.decidedAt}, según la política de privacidad versión ${p.version}.`,
      "Podés retirarlo cuando quieras escribiendo a la escuela.",
    ], { label: "Ver la política de privacidad", url: p.privacyUrl }),
};
