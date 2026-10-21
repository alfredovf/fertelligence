// Fechas en hora de Argentina (UTC-3, sin horario de verano).
const TZ = "America/Argentina/Buenos_Aires";

export const formatDateTime = (d: Date) => new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(d);
export const formatDate = (d: Date) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: TZ }).format(d);
export const formatWeekday = (d: Date) => new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "numeric", timeZone: TZ }).format(d);

// Valor para <input type="datetime-local"> en hora de Argentina.
export function toLocalInput(d: Date): string {
  const shifted = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

// Próximo día hábil a una hora dada, para sugerir fechas por defecto.
export function defaultDates(now = new Date()) {
  const start = new Date(now.getTime());
  const due = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
  const local = toLocalInput(due).slice(0, 10);
  return { startsAt: toLocalInput(start), dueAt: `${local}T23:59` };
}
