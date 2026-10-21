import Link from "next/link";

// Páginas sin sesión: ingreso, recuperación, consentimiento, privacidad.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-4 sm:px-6">
        <Link href="/" className="font-display text-xl font-bold tracking-tight text-ink no-underline">
          Fert<span className="text-accent">elligence</span>
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-5 px-4 pb-10 sm:px-6">{children}</main>
      <footer className="px-4 py-4 text-center text-sm text-muted sm:px-6">
        <Link href="/privacidad" className="text-muted">
          Política de privacidad
        </Link>
      </footer>
    </div>
  );
}
