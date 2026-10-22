import { generateCodeVerifier, generateState } from "arctic";
import { googleClient } from "../auth/google";
import { env } from "../env";
import { accessTokenFor, GoogleNotConnected, saveGoogleToken } from "./tokens";

// Google Classroom, Forms y Drive. Solo lectura. Los permisos se piden recién al tocar "Conectar Classroom":
// el docente pide los de materiales; el administrador, además, los de cursos y alumnos.

const S = "https://www.googleapis.com/auth/";
export const TEACHER_SCOPES = [`${S}classroom.courses.readonly`, `${S}classroom.coursework.students.readonly`, `${S}classroom.courseworkmaterials.readonly`, `${S}forms.body.readonly`, `${S}drive.file`];
export const ADMIN_SCOPES = [`${S}classroom.courses.readonly`, `${S}classroom.rosters.readonly`, `${S}classroom.profile.emails`];

export function classroomConfigured(): boolean {
  return Boolean(googleClient());
}

export function startClassroomConnect(scopes: string[]) {
  const client = googleClient();
  if (!client) throw new Error("El ingreso con Google no está configurado.");
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = client.createAuthorizationURL(state, codeVerifier, ["openid", "email", ...scopes]);
  url.searchParams.set("access_type", "offline"); // para recibir refresh token
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  return { url, state, codeVerifier };
}

export async function finishClassroomConnect(userId: string, code: string, codeVerifier: string): Promise<{ scopes: string[] }> {
  const client = googleClient();
  if (!client) throw new Error("El ingreso con Google no está configurado.");
  const tokens = await client.validateAuthorizationCode(code, codeVerifier);
  if (!tokens.hasRefreshToken()) throw new Error("Google no devolvió un permiso duradero. Probá desconectar la app desde tu cuenta de Google y volver a conectar.");
  const scopes = tokens.hasScopes() ? tokens.scopes() : [];
  await saveGoogleToken(userId, tokens.refreshToken(), scopes);
  return { scopes };
}

async function token(userId: string) {
  const client = googleClient();
  if (!client) throw new Error("El ingreso con Google no está configurado.");
  return accessTokenFor(userId, async (refreshToken) => {
    const t = await client.refreshAccessToken(refreshToken);
    return { accessToken: t.accessToken(), expiresAt: t.accessTokenExpiresAt() };
  });
}

// Token para el selector de archivos (Google Picker), que corre en el navegador del docente.
export async function pickerToken(userId: string) {
  return { accessToken: await token(userId), apiKey: process.env.GOOGLE_PICKER_API_KEY ?? "", appId: process.env.GOOGLE_PROJECT_NUMBER ?? "", origin: env.appUrl };
}

export class GoogleApiError extends Error {}

async function gget<T>(userId: string, url: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${await token(userId)}` } });
  if (response.status === 401) throw new GoogleNotConnected();
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new GoogleApiError(response.status === 403 ? "Google no dio permiso para esto. Volvé a conectar Classroom aceptando todos los permisos." : `Google respondió ${response.status}: ${body.error?.message ?? ""}`);
  }
  return (await response.json()) as T;
}

async function paged<T>(userId: string, url: string, key: string): Promise<T[]> {
  const all: T[] = [];
  let pageToken: string | undefined;
  do {
    const sep = url.includes("?") ? "&" : "?";
    const page = await gget<Record<string, unknown>>(userId, `${url}${sep}pageSize=100${pageToken ? `&pageToken=${pageToken}` : ""}`);
    all.push(...((page[key] as T[]) ?? []));
    pageToken = page.nextPageToken as string | undefined;
  } while (pageToken && all.length < 2000);
  return all;
}

const CLASSROOM = "https://classroom.googleapis.com/v1";

export type ClassroomCourse = { id: string; name: string; section?: string; ownerId?: string; courseState?: string };

export function listCourses(userId: string, onlyMine: boolean) {
  return paged<ClassroomCourse>(userId, `${CLASSROOM}/courses?courseStates=ACTIVE${onlyMine ? "&teacherId=me" : ""}`, "courses");
}

type RawMaterial = {
  driveFile?: { driveFile: { id: string; title: string; alternateLink?: string } };
  form?: { formUrl: string; title: string; responseUrl?: string };
  link?: { url: string; title?: string };
  youtubeVideo?: { title?: string };
};

export type MaterialAttachment = { kind: "drive"; fileId: string; title: string } | { kind: "form"; formId: string; title: string } | { kind: "link"; url: string; title: string };
export type CourseMaterial = { id: string; title: string; description?: string; source: "coursework" | "material"; attachments: MaterialAttachment[] };

export function parseAttachments(materials: RawMaterial[] = []): MaterialAttachment[] {
  const out: MaterialAttachment[] = [];
  for (const m of materials) {
    if (m.driveFile) out.push({ kind: "drive", fileId: m.driveFile.driveFile.id, title: m.driveFile.driveFile.title });
    else if (m.form) {
      const id = /\/forms\/d\/(?:e\/)?([\w-]+)/.exec(m.form.formUrl)?.[1];
      if (id) out.push({ kind: "form", formId: id, title: m.form.title });
    } else if (m.link) out.push({ kind: "link", url: m.link.url, title: m.link.title ?? m.link.url });
  }
  return out;
}

export async function listMaterials(userId: string, courseId: string): Promise<CourseMaterial[]> {
  const [work, materials] = await Promise.all([
    paged<{ id: string; title: string; description?: string; materials?: RawMaterial[] }>(userId, `${CLASSROOM}/courses/${courseId}/courseWork`, "courseWork"),
    paged<{ id: string; title: string; description?: string; materials?: RawMaterial[] }>(userId, `${CLASSROOM}/courses/${courseId}/courseWorkMaterials`, "courseWorkMaterial"),
  ]);
  return [
    ...work.map((w) => ({ id: w.id, title: w.title, description: w.description, source: "coursework" as const, attachments: parseAttachments(w.materials) })),
    ...materials.map((w) => ({ id: w.id, title: w.title, description: w.description, source: "material" as const, attachments: parseAttachments(w.materials) })),
  ].filter((m) => m.attachments.length > 0);
}

export type RosterPerson = { userId: string; firstName: string; lastName: string; email: string | null };

type RawProfile = { userId: string; profile: { name?: { givenName?: string; familyName?: string; fullName?: string }; emailAddress?: string } };

function toPerson(p: RawProfile): RosterPerson {
  const name = p.profile.name ?? {};
  const [first = "", ...rest] = (name.fullName ?? "").split(" ");
  return { userId: p.userId, firstName: name.givenName ?? first, lastName: name.familyName ?? rest.join(" "), email: p.profile.emailAddress?.toLowerCase() ?? null };
}

export async function courseRoster(userId: string, courseId: string) {
  const [teachers, students] = await Promise.all([
    paged<RawProfile>(userId, `${CLASSROOM}/courses/${courseId}/teachers`, "teachers"),
    paged<RawProfile>(userId, `${CLASSROOM}/courses/${courseId}/students`, "students"),
  ]);
  return { teachers: teachers.map(toPerson), students: students.map(toPerson) };
}

// ---------- Forms ----------

export type RawForm = {
  formId: string;
  info?: { title?: string; documentTitle?: string; description?: string };
  items?: {
    itemId: string;
    title?: string;
    questionItem?: {
      question?: {
        choiceQuestion?: { type?: "RADIO" | "CHECKBOX" | "DROP_DOWN"; options?: { value?: string; isOther?: boolean }[] };
        textQuestion?: unknown;
        scaleQuestion?: unknown;
        grading?: { pointValue?: number; correctAnswers?: { answers?: { value: string }[] }; whenRight?: { text?: string }; generalFeedback?: { text?: string } };
      };
    };
  }[];
};

export function getForm(userId: string, formId: string) {
  return gget<RawForm>(userId, `https://forms.googleapis.com/v1/forms/${formId}`);
}

// ---------- Drive ----------

export async function downloadDriveFile(userId: string, fileId: string): Promise<{ name: string; mimeType: string; text?: string; bytes?: Buffer }> {
  const meta = await gget<{ name: string; mimeType: string; size?: string }>(userId, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size`);
  const auth = { Authorization: `Bearer ${await token(userId)}` };
  if (meta.mimeType.startsWith("application/vnd.google-apps.")) {
    // Documentos de Google: se exportan como texto (presentaciones y documentos) para usarlos como texto fuente.
    if (!["application/vnd.google-apps.document", "application/vnd.google-apps.presentation"].includes(meta.mimeType)) throw new GoogleApiError("Ese tipo de archivo de Google no se puede importar. Usá un documento, una presentación, un PDF o una imagen.");
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`, { headers: auth });
    if (!r.ok) throw new GoogleApiError(`No se pudo exportar el archivo (${r.status}).`);
    return { name: meta.name, mimeType: "text/plain", text: (await r.text()).slice(0, 20_000) };
  }
  if (Number(meta.size ?? 0) > 15 * 1024 * 1024) throw new GoogleApiError("El archivo supera los 15 MB.");
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: auth });
  if (r.status === 404 || r.status === 403) throw new GoogleApiError("No hay permiso para leer ese archivo. Elegilo con el selector de Drive.");
  if (!r.ok) throw new GoogleApiError(`No se pudo descargar el archivo (${r.status}).`);
  return { name: meta.name, mimeType: meta.mimeType, bytes: Buffer.from(await r.arrayBuffer()) };
}

export { GoogleNotConnected };
