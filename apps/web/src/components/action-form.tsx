"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, Notice } from "./ui";

export type ActionState = { error?: string; success?: string } | null;
type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

// Formulario que llama a una server action y muestra su error o su confirmación.
export function ActionForm({ action, children, className }: { action: Action; children: ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? "flex flex-col gap-4"}>
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      {state?.success && <Notice tone="ok">{state.success}</Notice>}
      {children}
    </form>
  );
}

export function SubmitButton({ children, variant = "primary", pendingLabel, className }: { children: ReactNode; variant?: "primary" | "secondary" | "danger" | "ghost"; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      {pending ? (pendingLabel ?? "Guardando…") : children}
    </Button>
  );
}
