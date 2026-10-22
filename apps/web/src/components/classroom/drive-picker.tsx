"use client";

import { useState } from "react";

type PickerToken = { accessToken?: string; apiKey?: string; appId?: string; origin?: string; error?: string };

declare global {
  interface Window {
    gapi?: { load: (name: string, cb: () => void) => void };
    google?: { picker: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

let loading: Promise<void> | null = null;
function loadPicker(): Promise<void> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => window.gapi!.load("picker", () => resolve());
    script.onerror = () => reject(new Error("No se pudo cargar el selector de Google Drive."));
    document.head.appendChild(script);
  });
  return loading;
}

const MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic", "application/vnd.google-apps.document", "application/vnd.google-apps.presentation"].join(",");

// Selector de archivos de Google Drive. Da acceso solo al archivo elegido (permiso drive.file).
export function DrivePicker({ getToken, onPick, label = "Elegir archivo de Drive", query }: { getToken: () => Promise<PickerToken>; onPick: (fileId: string, name: string) => void; label?: string; query?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (token.error || !token.accessToken) throw new Error(token.error ?? "No se pudo abrir Drive.");
      await loadPicker();
      const gp = window.google!.picker;
      const view = new gp.DocsView(gp.ViewId.DOCS).setMimeTypes(MIME).setIncludeFolders(true);
      if (query) view.setQuery(query);
      const picker = new gp.PickerBuilder()
        .addView(view)
        .setOAuthToken(token.accessToken)
        .setDeveloperKey(token.apiKey)
        .setAppId(token.appId)
        .setOrigin(window.location.origin)
        .setLocale("es-419")
        .setCallback((data: { action: string; docs?: { id: string; name: string }[] }) => {
          if (data.action === gp.Action.PICKED && data.docs?.[0]) onPick(data.docs[0].id, data.docs[0].name);
        })
        .build();
      picker.setVisible(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir Drive.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={open} disabled={busy} className="min-h-10 rounded-lg border border-line bg-paper px-3 text-sm font-bold disabled:opacity-60">
        {busy ? "Abriendo Drive…" : label}
      </button>
      {error && <span className="text-sm text-bad">{error}</span>}
    </span>
  );
}
