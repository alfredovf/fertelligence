import "server-only";
import type { Role } from "@prisma/client";
import { ACHIEVEMENTS, type AchievementKind } from "@fertelligence/core/services/achievements";

// Texto y destino de cada aviso, según quién lo ve.
export function describeNotification(kind: string, payload: unknown, role: Role): { text: string; href: string } {
  const p = (payload ?? {}) as Record<string, unknown>;
  const title = String(p.title ?? "");
  switch (kind) {
    case "task.submitted":
      return { text: `Entregaron "${title}"${p.late ? " fuera de término" : ""}.`, href: role === "ADMIN" ? `/admin/correccion/${p.taskId}` : `/docente/correccion/${p.taskId}` };
    case "task.created_on_behalf":
      return { text: `${p.by} cargó en tu nombre la tarea "${title}".`, href: `/docente/tareas/${p.templateId}` };
    case "task.new":
      return { text: `Tarea nueva: "${title}".`, href: `/alumno/tareas/${p.taskId}` };
    case "task.due_soon":
      return { text: `Mañana vence "${title}".`, href: `/alumno/tareas/${p.taskId}` };
    case "task.corrected":
      return { text: `Ya está corregida "${title}": ${p.grade} / 10.`, href: `/alumno/tareas/${p.taskId}` };
    case "task.redo":
      return { text: `Tenés que rehacer "${title}".`, href: `/alumno/tareas/${p.taskId}` };
    case "achievement": {
      const a = ACHIEVEMENTS[p.kind as AchievementKind];
      return { text: a ? `Nuevo logro: ${a.label}. ${a.description}` : "Nuevo logro.", href: "/alumno/progreso" };
    }
    case "consent.refused":
      return { text: `La familia de ${p.studentName} no dio el consentimiento.`, href: `/admin/alumnos/${p.studentId}` };
    case "ai.budget_80":
      return { text: `La inteligencia artificial ya usó USD ${p.spent} de ${p.budget} este mes.`, href: "/admin/configuracion" };
    case "ai.budget_reached":
      return { text: `Se alcanzó el tope mensual de inteligencia artificial (USD ${p.budget}). Se pausó hasta el mes que viene.`, href: "/admin/configuracion" };
    default:
      return { text: "Tenés un aviso nuevo.", href: "/" };
  }
}
