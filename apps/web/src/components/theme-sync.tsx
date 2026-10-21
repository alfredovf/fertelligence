"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

const map = { SYSTEM: "system", LIGHT: "light", DARK: "dark" } as const;

// Aplica el tema guardado en la cuenta, así se mantiene en todos los dispositivos.
export function ThemeSync({ preference }: { preference: keyof typeof map }) {
  const { setTheme } = useTheme();
  useEffect(() => {
    setTheme(map[preference]);
  }, [preference, setTheme]);
  return null;
}
