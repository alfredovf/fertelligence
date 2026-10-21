"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const options = [
  { value: "system", label: "Sistema" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div role="radiogroup" aria-label="Tema" className="inline-flex rounded-full border border-line bg-paper p-1 text-sm">
      {options.map((option) => {
        const active = mounted && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(option.value)}
            className={`min-h-9 rounded-full px-3 font-bold transition-colors ${active ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
