import { taskTypeLabels, type TaskTypeName } from "@fertelligence/core";
import type { TemplateSettings } from "@fertelligence/core/services/tasks";
import { Field, Input, Select, Textarea } from "@/components/ui";

const typeHelp: Record<TaskTypeName, string> = {
  MULTIPLE_CHOICE: "Preguntas con opciones, de respuesta única o varias.",
  TRUE_FALSE: "Afirmaciones para marcar verdadero o falso, con justificación opcional.",
  MATCHING: "Unir con flechas elementos de dos columnas.",
  FILL_BLANKS: "Un texto con palabras o frases para completar.",
  STRIKE_OUT: "Un texto de un tema y frases para tachar las que no corresponden.",
};

export function TaskMetaFields({
  subjects,
  defaults,
  typeLocked,
}: {
  subjects: { id: string; name: string }[];
  defaults?: { title: string; instructions: string; subjectId: string; type: TaskTypeName; settings: TemplateSettings };
  typeLocked?: boolean;
}) {
  const settings = defaults?.settings ?? { shuffle: true, redoScope: "INCORRECT_ONLY" };
  return (
    <>
      <Field label="Título">
        <Input name="title" defaultValue={defaults?.title} required maxLength={120} placeholder="Por ejemplo, Estados del agua" />
      </Field>
      <Field label="Consigna general" hint="Es lo primero que lee el alumno. Usá oraciones cortas.">
        <Textarea name="instructions" defaultValue={defaults?.instructions} required maxLength={2000} placeholder="Leé cada pregunta y elegí la respuesta correcta." />
      </Field>
      <Field label="Materia">
        <Select name="subjectId" defaultValue={defaults?.subjectId ?? ""} required>
          <option value="" disabled>
            Elegí la materia
          </option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      {typeLocked ? (
        <p className="text-sm">
          <span className="font-bold text-muted">Tipo de tarea:</span> {defaults && taskTypeLabels[defaults.type]} <span className="text-muted">(no se puede cambiar)</span>
        </p>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold text-muted">Tipo de tarea (todos los ítems son de este tipo)</legend>
          {(Object.keys(taskTypeLabels) as TaskTypeName[]).map((t) => (
            <label key={t} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
              <input type="radio" name="type" value={t} defaultChecked={(defaults?.type ?? "MULTIPLE_CHOICE") === t} className="mt-1 size-4" />
              <span>
                <b>{taskTypeLabels[t]}</b>
                <span className="block text-sm text-muted">{typeHelp[t]}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold text-muted">Si el alumno la tiene que rehacer, rehace…</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="redoScope" value="INCORRECT_ONLY" defaultChecked={settings.redoScope === "INCORRECT_ONLY"} className="size-4" />
          Solo los ítems incorrectos (los correctos se conservan)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="redoScope" value="ALL" defaultChecked={settings.redoScope === "ALL"} className="size-4" />
          Toda la tarea
        </label>
      </fieldset>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="shuffle" defaultChecked={settings.shuffle} className="size-4" />
        Mezclar el orden de las opciones para cada alumno
      </label>
    </>
  );
}
