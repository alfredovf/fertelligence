import { prisma } from "@fertelligence/core/db";
import { ADMIN_SCOPES, classroomConfigured } from "@fertelligence/core/google/classroom";
import { googleConnection } from "@fertelligence/core/google/tokens";
import { STUDENT_COLUMNS, TEACHER_COLUMNS } from "@fertelligence/core/services/import";
import Link from "next/link";
import { ClassroomConnection } from "@/components/classroom/pages";
import { RosterImport } from "@/components/classroom/roster-import";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importar · Fertelligence" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ tipo?: string; classroom?: string }> }) {
  const user = await requireUser("ADMIN");
  const { tipo, classroom } = await searchParams;
  const tabs = [
    { key: "", label: "Alumnos (planilla)" },
    { key: "docentes", label: "Docentes (planilla)" },
    { key: "classroom", label: "Desde Google Classroom" },
  ];
  const current = tabs.find((t) => t.key === (tipo ?? ""))?.key ?? "";

  return (
    <>
      <PageHeader title="Importar" subtitle="Cargá muchas personas de una vez. Primero ves qué se va a hacer; nada se crea hasta que confirmes." />
      <nav aria-label="Tipo" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link key={t.key} href={t.key ? `/admin/importar?tipo=${t.key}` : "/admin/importar"} className={`rounded-full border px-3 py-1 text-sm no-underline ${current === t.key ? "border-accent bg-accent-soft font-bold text-accent" : "border-line text-ink"}`}>
            {t.label}
          </Link>
        ))}
      </nav>
      {current === "classroom" ? <ClassroomTab userId={user.id} notice={classroom} user={user} /> : <SpreadsheetTab kind={current === "docentes" ? "TEACHER" : "STUDENT"} />}
    </>
  );
}

async function ClassroomTab({ user, userId, notice }: { user: Awaited<ReturnType<typeof requireUser>>; userId: string; notice?: string }) {
  const connection = classroomConfigured() ? await googleConnection(userId) : null;
  const ready = connection && ADMIN_SCOPES.every((s) => connection.scopes.includes(s));
  const settings = await prisma.schoolSettings.findUnique({ where: { id: 1 } });
  const [courses, subjects] = await Promise.all([
    prisma.course.findMany({ where: { cycleId: settings?.activeCycleId ?? undefined }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.subject.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <ClassroomConnection user={user} back="/admin/importar?tipo=classroom" notice={notice} />
      {ready && (
        <Card title="Cursos de Classroom">
          <p className="mb-3 text-sm text-muted">Elegí los cursos y relacioná cada uno con un curso y una materia de Fertelligence. Se crean los alumnos y docentes que falten (se reconocen por email) y se proponen las asignaciones.</p>
          <RosterImport courses={courses} subjects={subjects} />
        </Card>
      )}
    </>
  );
}

function SpreadsheetTab({ kind }: { kind: "STUDENT" | "TEACHER" }) {
  const columns = kind === "STUDENT" ? STUDENT_COLUMNS : TEACHER_COLUMNS;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <Card>
        <ImportForm key={kind} kind={kind} />
      </Card>
      <Card title="Columnas de la planilla">
        <p className="mb-2 text-sm text-muted">La primera fila tiene que tener estos encabezados. El orden no importa.</p>
        <ul className="flex flex-col gap-1 font-mono text-sm">
          {columns.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">
          {kind === "STUDENT"
            ? "Obligatorias: nombre, apellido, email y curso (tiene que existir). Las de la familia son opcionales, pero sin email_familia el consentimiento se registra en papel."
            : "Obligatorias: nombre, apellido y email. En materias, separá varias con punto y coma; tienen que existir."}
        </p>
        <a href={`/admin/importar/plantilla?tipo=${kind === "STUDENT" ? "alumnos" : "docentes"}`} className="mt-3 inline-block">
          Descargar planilla de ejemplo
        </a>
      </Card>
    </div>
  );
}
