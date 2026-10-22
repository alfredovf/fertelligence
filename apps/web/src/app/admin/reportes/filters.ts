// Filtros del reporte: fechas de entrega (hora de Argentina) y curso. Por defecto, las últimas 8 semanas.
export function parseReportFilters(params: { desde?: string; hasta?: string; curso?: string }) {
  const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const eightWeeksAgo = new Date(Date.now() - 56 * 86_400_000 - 3 * 3600_000).toISOString().slice(0, 10);
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
  const desde = valid(params.desde) ?? eightWeeksAgo;
  const hasta = valid(params.hasta) ?? today;
  return {
    desde,
    hasta,
    curso: params.curso || null,
    filter: { from: new Date(`${desde}T00:00:00-03:00`), to: new Date(`${hasta}T23:59:59-03:00`), courseId: params.curso || null },
  };
}
