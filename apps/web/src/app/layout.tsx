import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, JetBrains_Mono, Lexend } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const lexend = Lexend({ subsets: ["latin"], variable: "--font-lexend", display: "swap" });
const atkinson = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-atkinson", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "Fertelligence",
  description: "Tareas cortas, claras y a tu ritmo.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#11141d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" suppressHydrationWarning className={`${lexend.variable} ${atkinson.variable} ${jetbrains.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
