import type { Role, UserStatus } from "@prisma/client";
import { Field, Input, Pill, Select } from "@/components/ui";

// Campos del alta y la edición de personas. Se usan dentro de un ActionForm.

type Person = {
  firstName: string;
  lastName: string;
  email: string;
  studentProfile?: { courseId: string; familyContactName: string | null; familyContactEmail: string | null; familyContactPhone: string | null } | null;
  teacherSubjects?: { subjectId: string }[];
};

export function PersonFields({
  role,
  person,
  courses = [],
  subjects = [],
}: {
  role: Role;
  person?: Person;
  courses?: { id: string; name: string }[];
  subjects?: { id: string; name: string }[];
}) {
  const selected = new Set(person?.teacherSubjects?.map((t) => t.subjectId));
  const profile = person?.studentProfile;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre">
          <Input name="firstName" defaultValue={person?.firstName} required maxLength={60} autoComplete="off" />
        </Field>
        <Field label="Apellido">
          <Input name="lastName" defaultValue={person?.lastName} required maxLength={60} autoComplete="off" />
        </Field>
      </div>
      <Field label="Email" hint={role === "STUDENT" ? "El del alumno. Si es de Gmail, va a poder entrar con Google." : "Con este email entra con Google o crea su contraseña."}>
        <Input name="email" type="email" defaultValue={person?.email} required autoComplete="off" />
      </Field>

      {role === "STUDENT" && (
        <>
          <Field label="Curso">
            <Select name="courseId" defaultValue={profile?.courseId ?? ""} required>
              <option value="" disabled>
                Elegí un curso
              </option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-bold text-muted">Contacto de la familia (no ingresa al sistema)</legend>
            <Field label="Nombre y apellido">
              <Input name="familyContactName" defaultValue={profile?.familyContactName ?? ""} maxLength={120} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email" hint="A este email le llega el pedido de consentimiento.">
                <Input name="familyContactEmail" type="email" defaultValue={profile?.familyContactEmail ?? ""} />
              </Field>
              <Field label="Teléfono">
                <Input name="familyContactPhone" type="tel" defaultValue={profile?.familyContactPhone ?? ""} maxLength={40} />
              </Field>
            </div>
          </fieldset>
        </>
      )}

      {role === "TEACHER" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold text-muted">Materias que dicta</legend>
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => (
              <label key={s.id} className="cursor-pointer">
                <input type="checkbox" name="subjectIds" value={s.id} defaultChecked={selected.has(s.id)} className="peer sr-only" />
                <span className="inline-flex min-h-10 items-center rounded-full border border-line px-3 text-sm peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-bold peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                  {s.name}
                </span>
              </label>
            ))}
            {subjects.length === 0 && <span className="text-sm text-muted">Primero creá las materias.</span>}
          </div>
        </fieldset>
      )}
    </>
  );
}

export function StatusPill({ status, neverLoggedIn }: { status: UserStatus; neverLoggedIn?: boolean }) {
  if (status === "DISABLED") return <Pill tone="muted">Desactivado</Pill>;
  if (status === "PENDING_CONSENT") return <Pill tone="warn">Esperando consentimiento</Pill>;
  if (neverLoggedIn) return <Pill tone="accent">Invitación enviada</Pill>;
  return <Pill tone="ok">Activo</Pill>;
}
