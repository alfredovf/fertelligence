import { prisma } from "@fertelligence/core/db";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Table, Textarea } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { saveSubjectAction, toggleSubjectArchivedAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Materias · Fertelligence" };

const COLORS = ["#3346C8", "#1D8656", "#A96E12", "#C03D37", "#5B6480", "#7A3FB8"];

type SubjectData = { name: string; area: string | null; color: string | null; description: string | null };

function SubjectFields({ subject }: { subject?: SubjectData }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre">
          <Input name="name" defaultValue={subject?.name} required maxLength={80} />
        </Field>
        <Field label="Área (opcional)">
          <Input name="area" defaultValue={subject?.area ?? ""} maxLength={80} />
        </Field>
      </div>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-1 text-sm font-bold text-muted">Color, para que los alumnos reconozcan la materia</legend>
        {COLORS.map((c) => (
          <label key={c} className="cursor-pointer">
            <input type="radio" name="color" value={c} defaultChecked={(subject?.color ?? COLORS[0]) === c} className="peer sr-only" />
            <span
              className="block size-8 rounded-lg ring-offset-2 ring-offset-paper peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
              style={{ background: c }}
              aria-label={`Color ${c}`}
            />
          </label>
        ))}
      </fieldset>
      <Field label="Descripción (opcional)">
        <Textarea name="description" defaultValue={subject?.description ?? ""} maxLength={500} />
      </Field>
    </>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`rounded-full border px-3 py-1 text-sm no-underline ${active ? "border-accent bg-accent-soft font-bold text-accent" : "border-line text-ink"}`}>
      {children}
    </Link>
  );
}

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ ver?: string; editar?: string }> }) {
  await requireUser("ADMIN");
  const { ver, editar } = await searchParams;
  const archived = ver === "archivadas";
  const subjects = await prisma.subject.findMany({
    where: { archivedAt: archived ? { not: null } : null },
    include: { _count: { select: { teachers: true, assignments: { where: { active: true } } } } },
    orderBy: { name: "asc" },
  });
  const editing = editar ? await prisma.subject.findUnique({ where: { id: editar } }) : null;

  return (
    <>
      <PageHeader title="Materias" />
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex gap-2">
            <Tab href="/admin/materias" active={!archived}>
              Activas
            </Tab>
            <Tab href="/admin/materias?ver=archivadas" active={archived}>
              Archivadas
            </Tab>
          </div>
          <Table>
            <thead>
              <tr>
                <th>Materia</th>
                <th>Área</th>
                <th className="text-right">Docentes</th>
                <th className="text-right">Alumnos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="mr-2 inline-block size-3 rounded-sm align-middle" style={{ background: s.color ?? "var(--muted)" }} />
                    <b>{s.name}</b>
                  </td>
                  <td>{s.area ?? "—"}</td>
                  <td className="text-right">{s._count.teachers}</td>
                  <td className="text-right">{s._count.assignments}</td>
                  <td className="text-right whitespace-nowrap">
                    <Link href={`/admin/materias?editar=${s.id}`}>Editar</Link>
                    <form action={toggleSubjectArchivedAction.bind(null, s.id, !archived)} className="ml-3 inline">
                      <button type="submit" className="text-sm text-muted underline hover:text-ink">
                        {archived ? "Reactivar" : "Archivar"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {subjects.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted">
                    {archived ? "No hay materias archivadas." : "Todavía no hay materias. Creá la primera."}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
        <Card title={editing ? `Editar ${editing.name}` : "Nueva materia"} actions={editing && <Link href="/admin/materias">Cancelar</Link>}>
          <ActionForm key={editing?.id ?? "new"} action={saveSubjectAction.bind(null, editing?.id ?? null)}>
            <SubjectFields subject={editing ?? undefined} />
            <SubmitButton>{editing ? "Guardar cambios" : "Crear materia"}</SubmitButton>
          </ActionForm>
          <p className="mt-3 text-xs text-muted">Una materia con tareas no se borra: se archiva y deja de aparecer para nuevas asignaciones. Se puede reactivar.</p>
        </Card>
      </div>
    </>
  );
}
