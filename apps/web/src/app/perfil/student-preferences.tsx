import type { StudentPreferences } from "@fertelligence/core/services/attempts";
import { savePreferencesAction } from "@/app/alumno/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card } from "@/components/ui";

const sizes = [
  { value: "normal", label: "Normal", className: "text-base" },
  { value: "large", label: "Grande", className: "text-lg" },
  { value: "xlarge", label: "Muy grande", className: "text-2xl" },
] as const;

const toggles: { name: keyof StudentPreferences; label: string; hint?: string }[] = [
  { name: "autoRead", label: "Leer cada pregunta en voz alta automáticamente" },
  { name: "pauseReminders", label: "Avisarme cuándo tomar una pausa", hint: "Cada 10 minutos mientras resolvés." },
  { name: "showTimer", label: "Mostrar cuánto tiempo llevo" },
  { name: "reduceMotion", label: "Menos animaciones" },
  { name: "showAchievements", label: "Mostrar racha y logros" },
];

export function StudentPreferencesCard({ prefs }: { prefs: StudentPreferences }) {
  return (
    <Card title="Cómo quiero ver las tareas">
      <ActionForm action={savePreferencesAction}>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold text-muted">Tamaño de letra</legend>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => (
              <label key={s.value} className="cursor-pointer">
                <input type="radio" name="fontSize" value={s.value} defaultChecked={prefs.fontSize === s.value} className="peer sr-only" />
                <span className={`inline-flex min-h-11 items-center rounded-full border-2 border-line px-4 peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${s.className}`}>
                  {s.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {toggles.map((t) => (
          <label key={t.name} className="flex min-h-11 items-start gap-3">
            <input type="checkbox" name={t.name} defaultChecked={Boolean(prefs[t.name])} className="mt-1 size-5" />
            <span>
              {t.label}
              {t.hint && <span className="block text-sm text-muted">{t.hint}</span>}
            </span>
          </label>
        ))}
        <p className="text-sm text-muted">Los colores (claro u oscuro) se eligen en Tema.</p>
        <SubmitButton>Guardar preferencias</SubmitButton>
      </ActionForm>
    </Card>
  );
}
