import Link from "next/link";
import { TaskCard } from "@/components/student/task-card";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { studentTasks, type StudentTaskCard } from "@/lib/student";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mis tareas · Fertelligence" };

const filters: { key: string; label: string; test: (c: StudentTaskCard) => boolean }[] = [
  { key: "", label: "Todas", test: () => true },
  { key: "nuevas", label: "Nuevas", test: (c) => ["NEW", "IN_PROGRESS", "OVERDUE", "REDO"].includes(c.status) },
  { key: "completadas", label: "Completadas", test: (c) => c.status === "COMPLETED" },
  { key: "corregidas", label: "Corregidas", test: (c) => c.status === "CORRECTED" },
];

export default async function MyTasksPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const user = await requireUser("STUDENT");
  const { ver } = await searchParams;
  const cards = await studentTasks(user.id);
  const filter = filters.find((f) => f.key === (ver ?? "")) ?? filters[0]!;
  // Pendientes primero (por fecha de entrega); después lo entregado, lo más reciente arriba
  const open = (c: StudentTaskCard) => ["NEW", "IN_PROGRESS", "OVERDUE", "REDO"].includes(c.status);
  const shown = cards.filter(filter.test).sort((a, b) => Number(open(b)) - Number(open(a)) || (open(a) ? a.dueAt.getTime() - b.dueAt.getTime() : b.dueAt.getTime() - a.dueAt.getTime()));

  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Mis tareas</h1>
      <nav aria-label="Filtro" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {filters.map((f) => {
          const count = cards.filter(f.test).length;
          return (
            <Link
              key={f.key}
              href={f.key ? `/alumno/tareas?ver=${f.key}` : "/alumno/tareas"}
              aria-current={filter.key === f.key ? "page" : undefined}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold no-underline ${filter.key === f.key ? "border-accent bg-accent-soft text-accent" : "border-line bg-paper text-ink"}`}
            >
              {f.label}
              {f.key && count > 0 ? ` (${count})` : ""}
            </Link>
          );
        })}
      </nav>
      {shown.length === 0 ? <EmptyState>No hay tareas en esta lista.</EmptyState> : shown.map((c) => <TaskCard key={c.id} card={c} />)}
    </>
  );
}
