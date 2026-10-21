"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Field, Input, Notice, Pill } from "@/components/ui";
import { importAction, type ImportState } from "../actions";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Procesando…" : children}
    </Button>
  );
}

const statusPill = { new: <Pill tone="ok">Se crea</Pill>, exists: <Pill tone="muted">Ya existe</Pill>, invalid: <Pill tone="bad">Con error</Pill> };

export function ImportForm({ kind }: { kind: "STUDENT" | "TEACHER" }) {
  const [state, action] = useActionState<ImportState, FormData>(importAction, null);
  const rows = state?.kind === kind ? state.rows : undefined;
  const counts = rows && { new: rows.filter((r) => r.status === "new").length, exists: rows.filter((r) => r.status === "exists").length, invalid: rows.filter((r) => r.status === "invalid").length };

  return (
    <div className="flex flex-col gap-4">
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.success && (
        <Notice tone="ok">
          {state.success}
          {state.failed && state.failed.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {state.failed.map((f) => (
                <li key={f.line}>
                  Fila {f.line}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </Notice>
      )}

      {!rows && (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="step" value="preview" />
          <Field label="Planilla en formato CSV" hint="Exportala desde Excel o Google Sheets con Archivo › Descargar › CSV. Hasta 1000 filas.">
            <Input name="file" type="file" accept=".csv,text/csv" required className="py-2" />
          </Field>
          <div>
            <Submit>Revisar planilla</Submit>
          </div>
        </form>
      )}

      {rows && counts && (
        <>
          <p>
            <b>{counts.new}</b> se van a crear · <b>{counts.exists}</b> ya existen y se saltean · <b>{counts.invalid}</b> tienen errores.
          </p>
          <div className="max-h-96 overflow-auto rounded-xl border border-line bg-paper">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-paper text-xs font-bold tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-3 py-2">Fila</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className="border-t border-line">
                    <td className="px-3 py-2 tabular-nums">{r.line}</td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{r.email}</td>
                    <td className="px-3 py-2">
                      {statusPill[r.status]} {r.error && <span className="text-bad">{r.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={action} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="step" value="confirm" />
            <input type="hidden" name="csv" value={state?.csv ?? ""} />
            {counts.new > 0 && <Submit>Crear {counts.new} {kind === "STUDENT" ? (counts.new === 1 ? "alumno" : "alumnos") : counts.new === 1 ? "docente" : "docentes"}</Submit>}
            <a href={kind === "STUDENT" ? "/admin/importar" : "/admin/importar?tipo=docentes"}>Elegir otra planilla</a>
          </form>
          {kind === "STUDENT" && counts.new > 0 && <p className="text-sm text-muted">A los alumnos con email de la familia les enviamos el pedido de consentimiento. Los demás quedan pendientes.</p>}
        </>
      )}
    </div>
  );
}
