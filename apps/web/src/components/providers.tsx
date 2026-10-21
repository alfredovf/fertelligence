"use client";

import { ThemeProvider } from "next-themes";
import { useEffect } from "react";

function useServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  useServiceWorker();
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
