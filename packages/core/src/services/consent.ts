import { audit } from "../audit";
import { consumeVerificationToken, createVerificationToken, DAY, peekVerificationToken } from "../auth/verification";
import { invalidateUserSessions } from "../auth/session";
import { prisma } from "../db";
import { emails } from "../email/templates";
import { env } from "../env";
import { enqueueEmail } from "../queue";
import { sendInvitation } from "./accounts";

// Consentimiento de la familia. Ver "Documentos legales y de consentimiento".

export const CONSENT_LINK_DAYS = 30;
export const REMINDER_DAYS = [7, 14];

export const consentStatements = (student: string, school: string) => [
  `Declaro que soy madre, padre, tutor o responsable legal de ${student}.`,
  `Leí la política de privacidad y doy mi consentimiento libre, expreso e informado para que ${school} y el proveedor de Fertelligence traten los datos personales de ${student} y los míos con las finalidades que ahí se describen.`,
  "Autorizo la transferencia internacional de esos datos a los proveedores indicados en la política (Google y Resend), que pueden procesarlos en países sin un nivel de protección equivalente al de Argentina, como Estados Unidos.",
  `Sé que puedo retirar este consentimiento en cualquier momento escribiendo a la escuela, y que en ese caso la cuenta de ${student} se desactivará.`,
];

export const RELATIONSHIPS = ["Madre", "Padre", "Tutor o tutora legal", "Otro responsable"] as const;

const dateFormat = new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "America/Argentina/Buenos_Aires" });
const dateTimeFormat = new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

async function currentPrivacyPolicy() {
  const doc = await prisma.legalDocument.findFirst({ where: { type: "PRIVACY_POLICY", effectiveFrom: { lte: new Date() } }, orderBy: { effectiveFrom: "desc" } });
  if (!doc) throw new Error("No hay una política de privacidad cargada.");
  return doc;
}

async function schoolName() {
  return (await prisma.schoolSettings.findUnique({ where: { id: 1 } }))?.name ?? env.schoolName;
}

// Envía (o reenvía) el email con el enlace personal a la familia.
export async function requestConsent(studentId: string, options: { reminder?: boolean; actorId?: string } = {}): Promise<{ ok: boolean; error?: string }> {
  const student = await prisma.user.findUniqueOrThrow({ where: { id: studentId }, include: { studentProfile: true } });
  const contact = student.studentProfile;
  if (!contact?.familyContactEmail) return { ok: false, error: "El alumno no tiene email de la familia cargado." };
  const token = await createVerificationToken(`consent:${student.id}`, CONSENT_LINK_DAYS * DAY);
  await enqueueEmail(
    emails.consentRequest({
      to: contact.familyContactEmail,
      contactName: contact.familyContactName ?? "familia",
      studentName: `${student.firstName} ${student.lastName}`,
      school: await schoolName(),
      url: `${env.appUrl}/consentimiento/${token}`,
      expires: dateFormat.format(new Date(Date.now() + CONSENT_LINK_DAYS * DAY)),
      reminder: Boolean(options.reminder),
    }),
  );
  await audit({ actorId: options.actorId, action: options.reminder ? "consent.reminder" : "consent.request", entity: "user", entityId: student.id, after: { to: contact.familyContactEmail } });
  return { ok: true };
}

export async function consentContext(token: string) {
  const studentId = await peekVerificationToken(token, "consent");
  if (!studentId) return null;
  const student = await prisma.user.findUnique({ where: { id: studentId }, include: { studentProfile: { include: { course: true } } } });
  if (!student || student.role !== "STUDENT") return null;
  const school = await schoolName();
  const policy = await currentPrivacyPolicy();
  const name = `${student.firstName} ${student.lastName}`;
  return {
    studentId: student.id,
    studentName: name,
    course: student.studentProfile?.course.name ?? "",
    contactEmail: student.studentProfile?.familyContactEmail ?? "",
    contactName: student.studentProfile?.familyContactName ?? "",
    school,
    policyVersion: policy.version,
    statements: consentStatements(name, school),
  };
}

type Decision = { grantorName: string; grantorRelationship: string; ip?: string | null; userAgent?: string | null };

export async function decideConsent(token: string, granted: boolean, decision: Decision): Promise<{ ok: boolean; error?: string }> {
  const context = await consentContext(token);
  if (!context) return { ok: false, error: "El enlace venció o ya se usó. Pedile a la escuela uno nuevo." };
  if (!decision.grantorName.trim() || !decision.grantorRelationship.trim()) return { ok: false, error: "Completá tu nombre y tu vínculo con el alumno." };
  if ((await consumeVerificationToken(token, "consent")) !== context.studentId) return { ok: false, error: "El enlace venció o ya se usó." };

  const policy = await currentPrivacyPolicy();
  const decidedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const consent = await tx.consent.create({
      data: {
        studentId: context.studentId, legalDocumentId: policy.id, method: "EMAIL_LINK", status: granted ? "GRANTED" : "REFUSED",
        grantorName: decision.grantorName.trim(), grantorRelationship: decision.grantorRelationship.trim(), grantorEmail: context.contactEmail,
        statements: granted ? context.statements : [], decidedAt, ip: decision.ip ?? null, userAgent: decision.userAgent ?? null,
      },
    });
    if (granted) await tx.user.update({ where: { id: context.studentId }, data: { status: "ACTIVE" } });
    await audit({ action: granted ? "consent.grant" : "consent.refuse", entity: "consent", entityId: consent.id, after: { studentId: context.studentId, method: "EMAIL_LINK" } }, tx);
    if (!granted) {
      const admins = await tx.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { id: true } });
      await tx.notification.createMany({ data: admins.map((a) => ({ userId: a.id, kind: "consent.refused", payload: { studentId: context.studentId, studentName: context.studentName } })) });
    }
  });

  if (granted) {
    await enqueueEmail(emails.consentReceipt({ to: context.contactEmail, contactName: decision.grantorName, studentName: context.studentName, decidedAt: dateTimeFormat.format(decidedAt), version: policy.version, privacyUrl: `${env.appUrl}/privacidad` }));
    await sendInvitation(context.studentId);
  }
  return { ok: true };
}

export async function recordPaperConsent(
  studentId: string,
  data: { grantorName: string; grantorRelationship: string; signedOn: Date; evidenceFileId?: string | null },
  actorId: string,
): Promise<void> {
  const policy = await currentPrivacyPolicy();
  const student = await prisma.user.findUniqueOrThrow({ where: { id: studentId } });
  const school = await schoolName();
  await prisma.$transaction(async (tx) => {
    const consent = await tx.consent.create({
      data: {
        studentId, legalDocumentId: policy.id, method: "PAPER", status: "GRANTED", grantorName: data.grantorName, grantorRelationship: data.grantorRelationship,
        statements: consentStatements(`${student.firstName} ${student.lastName}`, school), decidedAt: data.signedOn, evidenceFileId: data.evidenceFileId ?? null, recordedById: actorId,
      },
    });
    await tx.user.update({ where: { id: studentId }, data: { status: "ACTIVE" } });
    await tx.verificationToken.deleteMany({ where: { identifier: `consent:${studentId}` } });
    await audit({ actorId, action: "consent.grant", entity: "consent", entityId: consent.id, after: { studentId, method: "PAPER" } }, tx);
  });
  await sendInvitation(studentId, actorId);
}

export async function revokeConsent(studentId: string, actorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.consent.updateMany({ where: { studentId, status: "GRANTED", revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.user.update({ where: { id: studentId }, data: { status: "DISABLED" } });
    await audit({ actorId, action: "consent.revoke", entity: "user", entityId: studentId }, tx);
  });
  await invalidateUserSessions(studentId);
}

// Recordatorios a los 7 y 14 días del primer pedido. Lo corre el worker una vez por día.
export async function sendDueConsentReminders(): Promise<number> {
  const pending = await prisma.user.findMany({ where: { role: "STUDENT", status: "PENDING_CONSENT", deletedAt: null }, select: { id: true } });
  let sent = 0;
  for (const { id } of pending) {
    const requests = await prisma.auditLog.findMany({ where: { entity: "user", entityId: id, action: { in: ["consent.request", "consent.reminder"] } }, orderBy: { createdAt: "asc" } });
    const first = requests.find((r) => r.action === "consent.request");
    if (!first) continue;
    const reminders = requests.filter((r) => r.action === "consent.reminder").length;
    const nextDay = REMINDER_DAYS[reminders];
    if (nextDay === undefined) continue;
    if (Date.now() - first.createdAt.getTime() >= nextDay * DAY) {
      const result = await requestConsent(id, { reminder: true });
      if (result.ok) sent++;
    }
  }
  return sent;
}
