"use client";

import { useRef, useState } from "react";

export type UploadAction = (form: FormData) => Promise<{ id?: string; error?: string }>;

// Imagen opcional de un ítem o de una opción: sube el archivo y guarda su id.
export function ImageField({ value, onChange, upload, label = "Imagen" }: { value?: string | null; onChange: (id: string | null) => void; upload: UploadAction; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    const result: { id?: string; error?: string } = await upload(form).catch(() => ({ error: "No se pudo subir la imagen." }));
    setBusy(false);
    if (input.current) input.current.value = "";
    if (result.id) onChange(result.id);
    else setError(result.error ?? "No se pudo subir la imagen.");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {value && (
        <span className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/archivos/${value}`} alt="" className="h-14 w-20 rounded-md border border-line object-cover" />
        </span>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} aria-label={label} />
      <button type="button" onClick={() => input.current?.click()} disabled={busy} className="min-h-9 rounded-md border border-line px-2.5 text-sm text-ink hover:border-muted disabled:opacity-50">
        {busy ? "Subiendo…" : value ? "Cambiar imagen" : `+ ${label}`}
      </button>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="min-h-9 px-1 text-sm text-muted underline hover:text-bad">
          Quitar
        </button>
      )}
      {error && <span className="text-sm text-bad">{error}</span>}
    </div>
  );
}
