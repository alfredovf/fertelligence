import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Componentes base de la interfaz. Botones de al menos 44 px de alto para tocar cómodo en el celular.

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

const buttonStyles = {
  primary: "bg-accent text-accent-ink border-accent hover:opacity-90",
  secondary: "bg-paper text-ink border-line hover:border-muted",
  ghost: "bg-transparent text-accent border-transparent hover:bg-accent-soft",
  danger: "bg-paper text-bad border-line hover:border-bad",
} as const;

type Variant = keyof typeof buttonStyles;

export function Button({ variant = "secondary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={cx("inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 font-bold whitespace-nowrap transition disabled:opacity-50", buttonStyles[variant], className)}
    />
  );
}

export function LinkButton({ variant = "secondary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return (
    <Link
      {...props}
      className={cx("inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 font-bold whitespace-nowrap no-underline transition", buttonStyles[variant], className)}
    />
  );
}

const inputClass = "block w-full min-h-11 rounded-lg border border-line bg-paper px-3 text-ink placeholder:text-muted";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-bold text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cx(inputClass, className)} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={cx(inputClass, "pr-8", className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(inputClass, "min-h-24 py-2", className)} />;
}

export function Card({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-line bg-paper p-4 sm:p-5", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="font-display text-base font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const pillStyles = {
  accent: "bg-accent-soft text-accent",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  muted: "bg-sunk text-muted border border-line",
} as const;

export function Pill({ tone = "muted", children }: { tone?: keyof typeof pillStyles; children: ReactNode }) {
  return <span className={cx("inline-block rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap", pillStyles[tone])}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="text-sm text-muted no-underline hover:text-ink">
            ‹ {back.label}
          </Link>
        )}
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-paper">
      <table className="w-full text-left text-sm tabular-nums [&_td]:border-t [&_td]:border-line [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-bold [&_th]:tracking-wide [&_th]:text-muted [&_th]:uppercase">
        {children}
      </table>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line bg-paper p-6 text-center text-muted">{children}</p>;
}

export function Notice({ tone = "accent", children }: { tone?: "accent" | "ok" | "bad" | "warn"; children: ReactNode }) {
  const styles = { accent: "bg-accent-soft text-ink border-accent", ok: "bg-ok-soft text-ink border-ok", bad: "bg-bad-soft text-ink border-bad", warn: "bg-sun-soft text-ink border-sun" };
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("rounded-lg border px-4 py-3 text-sm", styles[tone])}>
      {children}
    </div>
  );
}

export { cx };
