"use client";

import { useEffect, useRef, useState } from "react";

// Voz del navegador: leer en voz alta (speechSynthesis) y dictar (SpeechRecognition). Sin costo.

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === "es-AR") ?? voices.find((v) => v.lang === "es-US" || v.lang === "es-419") ?? voices.find((v) => v.lang.startsWith("es"));
}

export function speak(text: string) {
  if (!("speechSynthesis" in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "es-AR";
  utterance.rate = 0.95;
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

export function ListenButton({ text, label = "Escuchar" }: { text: string; label?: string }) {
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported("speechSynthesis" in window), []);
  if (!supported) return null;
  return (
    <button type="button" onClick={() => speak(text)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-paper px-4 text-sm font-bold text-accent">
      <span aria-hidden="true" className="inline-block size-0 border-y-[6px] border-l-[9px] border-y-transparent border-l-current" />
      {label}
    </button>
  );
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function recognitionClass(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Dictar: agrega lo dictado al final del texto. Si el navegador no lo soporta, el botón no aparece
// (el alumno puede usar el micrófono del teclado del celular).
export function DictateButton({ onText }: { onText: (text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  useEffect(() => setSupported(Boolean(recognitionClass())), []);
  useEffect(() => () => recognition.current?.stop(), []);
  if (!supported) return null;

  function toggle() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Klass = recognitionClass();
    if (!Klass) return;
    const r = new Klass();
    r.lang = "es-AR";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) onText(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  }

  return (
    <button type="button" onClick={toggle} aria-pressed={listening} className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold ${listening ? "border-bad bg-bad-soft text-bad" : "border-line bg-paper text-ink"}`}>
      <span aria-hidden="true" className={`inline-block size-2.5 rounded-full ${listening ? "animate-pulse bg-bad" : "bg-muted"}`} />
      {listening ? "Escuchando… tocá para terminar" : "Dictar"}
    </button>
  );
}
