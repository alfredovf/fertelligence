import { env, taskTypeLabels } from "@fertelligence/core";
import { prisma } from "@fertelligence/core/db";
import { checkDatabase, checkQueue, checkStorage, type Check } from "@fertelligence/core/health";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

// Pantalla provisoria de la etapa 0: muestra que todas las piezas de la instalación funcionan.
async function loadSampleData() {
  try {
    const [settings, students, teachers, templates] = await Promise.all([
      prisma.schoolSettings.findUnique({ where: { id: 1 } }),
      prisma.user.count({ where: { role: "STUDENT" } }),
      prisma.user.count({ where: { role: "TEACHER" } }),
      prisma.taskTemplate.findMany({ select: { title: true, type: true, _count: { select: { tasks: true, items: true } } }, orderBy: { createdAt: "asc" } }),
    ]);
    return { settings, students, teachers, templates };
  } catch {
    return null;
  }
}

function StatusCard({ title, check }: { title: string; check: Check }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display font-semibold">{title}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${check.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
          {check.ok ? "Funciona" : "Con error"}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted break-words">{check.detail}</p>
    </div>
  );
}

function IntegrationRow({ name, configured, purpose }: { name: string; configured: boolean; purpose: string }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0">
      <div>
        <span className="font-bold">{name}</span>
        <span className="block text-sm text-muted">{purpose}</span>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${configured ? "bg-ok-soft text-ok" : "bg-sunk text-muted border border-line"}`}>
        {configured ? "Configurado" : "Sin clave"}
      </span>
    </li>
  );
}

export default async function Home() {
  const [database, storage, queue, sample] = await Promise.all([checkDatabase(), checkStorage(), checkQueue(), loadSampleData()]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-display text-2xl font-bold tracking-tight">
            Fert<span className="text-accent">elligence</span>
          </div>
          <p className="text-muted">{sample?.settings?.name ?? env.schoolName} · Etapa 0: base del proyecto</p>
        </div>
        <ThemeToggle />
      </header>

      <section aria-labelledby="estado" className="flex flex-col gap-3">
        <h2 id="estado" className="font-display text-xl font-semibold">Estado de la instalación</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatusCard title="Base de datos" check={database} />
          <StatusCard title="Archivos" check={storage} />
          <StatusCard title="Cola y worker" check={queue} />
        </div>
      </section>

      <section aria-labelledby="datos" className="flex flex-col gap-3">
        <h2 id="datos" className="font-display text-xl font-semibold">Datos de ejemplo</h2>
        {sample ? (
          <div className="rounded-xl border border-line bg-paper p-4">
            <p className="mb-3 text-muted">
              {sample.students} alumnos y {sample.teachers} docentes en 4° B. Una tarea de cada tipo, asignada a cada alumno:
            </p>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 font-bold">Tarea</th>
                  <th className="py-2 font-bold">Tipo</th>
                  <th className="py-2 text-right font-bold">Ítems</th>
                  <th className="py-2 text-right font-bold">Asignada a</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {sample.templates.map((t) => (
                  <tr key={t.title} className="border-t border-line">
                    <td className="py-2 font-bold">{t.title}</td>
                    <td className="py-2">{taskTypeLabels[t.type]}</td>
                    <td className="py-2 text-right">{t._count.items}</td>
                    <td className="py-2 text-right">{t._count.tasks} alumnos</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-xl border border-line bg-paper p-4 text-muted">No se pudieron leer los datos de ejemplo. Revisá que la base esté funcionando y que se hayan aplicado las migraciones.</p>
        )}
      </section>

      <section aria-labelledby="integraciones" className="flex flex-col gap-3">
        <h2 id="integraciones" className="font-display text-xl font-semibold">Servicios externos</h2>
        <ul className="rounded-xl border border-line bg-paper px-4">
          <IntegrationRow name="Claude (Anthropic)" configured={env.integrations.anthropic} purpose="Leer fotos y generar tareas · etapa 5" />
          <IntegrationRow name="Google" configured={env.integrations.google} purpose="Ingreso con Google y Classroom · etapas 1 y 6" />
          <IntegrationRow name="Resend" configured={env.integrations.resend} purpose="Emails · etapa 1" />
        </ul>
      </section>

      <footer className="text-sm text-muted">Versión 0.1.0 · El ingreso y las pantallas de cada rol llegan en la etapa 1.</footer>
    </main>
  );
}
