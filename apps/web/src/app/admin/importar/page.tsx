import { STUDENT_COLUMNS, TEACHER_COLUMNS } from "@fertelligence/core/services/import";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { ImportForm } from "./import-form";

export const metadata = { title: "Importar planilla · Fertelligence" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await requireUser("ADMIN");
  const { tipo } = await searchParams;
  const kind = tipo === "docentes" ? "TEACHER" : "STUDENT";
  const columns = kind === "STUDENT" ? STUDENT_COLUMNS : TEACHER_COLUMNS;

  return (
    <>
      <PageHeader title="Importar planilla" subtitle="Cargá muchas personas de una vez. Primero ves una vista previa; nada se crea hasta que confirmes." />
      <nav aria-label="Tipo" className="flex gap-2">
        {[
          { href: "/admin/importar", label: "Alumnos", active: kind === "STUDENT" },
          { href: "/admin/importar?tipo=docentes", label: "Docentes", active: kind === "TEACHER" },
        ].map((t) => (
          <Link key={t.href} href={t.href} className={`rounded-full border px-3 py-1 text-sm no-underline ${t.active ? "border-accent bg-accent-soft font-bold text-accent" : "border-line text-ink"}`}>
            {t.label}
          </Link>
        ))}
      </nav>
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
    </>
  );
}
