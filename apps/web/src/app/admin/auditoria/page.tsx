import { prisma } from "@fertelligence/core/db";
import { PageHeader, Select, Table } from "@/components/ui";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Auditoría · Fertelligence" };

const dateTime = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

// Etiquetas legibles para las acciones más comunes
const labels: Record<string, string> = {
  "auth.login": "Ingresó",
  "auth.login_failed": "Intento de ingreso fallido",
  "auth.password_set": "Creó su contraseña",
  "auth.password_reset_requested": "Pidió crear una contraseña nueva",
  "auth.logout_all": "Cerró sesión en todos lados",
  "user.create": "Dio de alta a una persona",
  "user.update": "Modificó una persona",
  "user.activate": "Reactivó una cuenta",
  "user.deactivate": "Desactivó una cuenta",
  "user.invitation_sent": "Envió el email de bienvenida",
  "subject.create": "Creó una materia",
  "subject.update": "Modificó una materia",
  "subject.archive": "Archivó una materia",
  "subject.unarchive": "Reactivó una materia",
  "course.create": "Creó un curso",
  "course.update": "Modificó un curso",
  "assignment.set": "Cambió una asignación",
  "consent.request": "Envió el pedido de consentimiento",
  "consent.reminder": "Envió un recordatorio de consentimiento",
  "consent.grant": "Registró un consentimiento",
  "consent.refuse": "La familia no dio el consentimiento",
  "consent.revoke": "Registró una revocación de consentimiento",
  "terms.accept": "Aceptó los términos de uso",
  "import.run": "Importó una planilla",
  "settings.update": "Cambió la configuración",
  seed: "Carga de datos de ejemplo",
};

const groups = [
  { value: "", label: "Todas las acciones" },
  { value: "auth.", label: "Ingresos" },
  { value: "user.", label: "Personas" },
  { value: "assignment.", label: "Asignaciones" },
  { value: "consent.", label: "Consentimientos" },
  { value: "subject.", label: "Materias" },
  { value: "settings.", label: "Configuración" },
];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await requireUser("ADMIN");
  const { tipo } = await searchParams;
  const group = groups.find((g) => g.value && g.value === tipo)?.value;
  const entries = await prisma.auditLog.findMany({ where: group ? { action: { startsWith: group } } : {}, orderBy: { createdAt: "desc" }, take: 200 });
  const ids = [...new Set(entries.flatMap((e) => [e.actorId, e.onBehalfOfId, e.entity === "user" ? e.entityId : null]).filter((v): v is string => Boolean(v)))];
  const people = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } })).map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  return (
    <>
      <PageHeader title="Auditoría" subtitle="Las últimas 200 acciones. Este registro no se puede modificar ni borrar." />
      <form className="flex max-w-xs gap-2">
        <Select name="tipo" defaultValue={group ?? ""} aria-label="Tipo de acción">
          {groups.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </Select>
        <button type="submit" className="min-h-11 rounded-lg border border-line bg-paper px-4 font-bold">
          Ver
        </button>
      </form>
      <Table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Quién</th>
            <th>Qué</th>
            <th>Sobre</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap text-muted">{dateTime.format(e.createdAt)}</td>
              <td>
                {e.actorId ? (people.get(e.actorId) ?? "Persona eliminada") : "Sistema"}
                {e.onBehalfOfId && <div className="text-xs text-muted">en nombre de {people.get(e.onBehalfOfId)}</div>}
              </td>
              <td>{labels[e.action] ?? e.action}</td>
              <td className="text-muted">{e.entity === "user" && e.entityId ? (people.get(e.entityId) ?? e.entityId) : e.entity === "login" ? e.entityId : ""}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
