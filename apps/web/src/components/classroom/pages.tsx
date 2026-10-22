import type { SessionUser } from "@fertelligence/core/auth/session";
import { prisma } from "@fertelligence/core/db";
import { ADMIN_SCOPES, classroomConfigured, listCourses, listMaterials, TEACHER_SCOPES, type CourseMaterial } from "@fertelligence/core/google/classroom";
import { googleConnection, GoogleNotConnected } from "@fertelligence/core/google/tokens";
import Link from "next/link";
import { disconnectClassroomAction } from "@/app/classroom-actions";
import { Card, Notice, PageHeader } from "@/components/ui";
import { MaterialsList } from "./materials-list";

// Estado de la conexión con Classroom y botón para conectar (o reconectar si faltan permisos).
export async function ClassroomConnection({ user, back, notice }: { user: SessionUser; back: string; notice?: string }) {
  if (!classroomConfigured()) {
    return <Notice tone="bad">Google todavía no está configurado en esta escuela. La administración tiene que cargar las claves de Google.</Notice>;
  }
  const connection = await googleConnection(user.id);
  const needed = user.role === "ADMIN" ? [...TEACHER_SCOPES, ...ADMIN_SCOPES] : TEACHER_SCOPES;
  const missing = connection ? needed.filter((s) => !connection.scopes.includes(s)) : needed;
  const connectHref = `/api/google/classroom/connect?volver=${encodeURIComponent(back)}`;
  return (
    <>
      {notice === "conectado" && <Notice tone="ok">Conectamos tu cuenta de Google Classroom.</Notice>}
      {notice === "error" && <Notice tone="bad">No se pudo conectar Classroom. Probá de nuevo y aceptá todos los permisos que pide Google.</Notice>}
      {!connection || missing.length > 0 ? (
        <Card>
          <p className="mb-3">{connection ? "Faltan permisos de Classroom. Volvé a conectar y aceptá todos los permisos." : "Conectá tu cuenta de Google para ver tus cursos de Classroom. Es solo lectura: Fertelligence no publica nada en Classroom."}</p>
          <a href={connectHref} className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-bold text-accent-ink no-underline">
            {connection ? "Volver a conectar Classroom" : "Conectar Google Classroom"}
          </a>
        </Card>
      ) : (
        <form action={disconnectClassroomAction} className="text-sm text-muted">
          Classroom conectado · solo lectura ·{" "}
          <button type="submit" className="text-accent underline">
            Desconectar
          </button>
        </form>
      )}
    </>
  );
}

export async function ClassroomTaskView({ user, teacherId, basePath, backHref, courseId, notice, selfPath }: { user: SessionUser; teacherId: string; basePath: string; backHref: string; courseId?: string; notice?: string; selfPath: string }) {
  const subjects = await prisma.subject.findMany({ where: { archivedAt: null, teachers: { some: { teacherId } } }, orderBy: { name: "asc" } });
  const connection = classroomConfigured() ? await googleConnection(user.id) : null;
  let courses: { id: string; name: string; section?: string }[] = [];
  let materials: CourseMaterial[] = [];
  let error: string | null = null;
  if (connection) {
    try {
      courses = await listCourses(user.id, true);
      if (courseId) materials = await listMaterials(user.id, courseId);
    } catch (e) {
      error = e instanceof GoogleNotConnected ? e.message : e instanceof Error ? e.message : "No pudimos leer tus cursos de Classroom.";
    }
  }
  const sep = selfPath.includes("?") ? "&" : "?";
  const course = courses.find((c) => c.id === courseId);

  return (
    <>
      <PageHeader title="Crear desde Google Classroom" subtitle="Importá un cuestionario de Forms o usá un archivo de un curso para generar la tarea." back={{ href: backHref, label: "Nueva tarea" }} />
      <ClassroomConnection user={user} back={selfPath} notice={notice} />
      {error && <Notice tone="bad">{error}</Notice>}
      {connection && !error && (
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <Card title="Tus cursos">
            {courses.length === 0 ? (
              <p className="text-muted">No encontramos cursos activos en los que seas docente.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {courses.map((c) => (
                  <li key={c.id}>
                    <Link href={`${selfPath}${sep}curso=${c.id}`} className={`block rounded-lg px-3 py-2 no-underline ${c.id === courseId ? "bg-accent font-bold text-accent-ink" : "text-ink hover:bg-sunk"}`}>
                      {c.name}
                      {c.section && <span className="block text-xs opacity-80">{c.section}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={course ? `Materiales de ${course.name}` : "Materiales"}>
            {course ? <MaterialsList teacherId={teacherId} basePath={basePath} subjects={subjects} materials={materials} /> : <p className="text-muted">Elegí un curso para ver sus materiales.</p>}
          </Card>
        </div>
      )}
    </>
  );
}
