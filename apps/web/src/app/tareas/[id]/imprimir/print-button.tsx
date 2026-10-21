"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg border border-accent bg-accent px-4 font-bold text-accent-ink">
      Imprimir
    </button>
  );
}
