export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Current month/year in São Paulo time. */
export function currentMonth(now: Date = new Date()): { month: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { month, year };
}

/** First day of the month as YYYY-MM-DD, matching monthly_charges.reference_month. */
export function referenceMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} de ${year}`;
}

/** YYYY-MM-DD -> dd/mm/aaaa */
export function formatDateBR(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Timestamp -> dd/mm/aaaa in São Paulo time. */
export function formatTimestampBR(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(ts));
}

export function yearOptions(currentYear: number): number[] {
  const years: number[] = [];
  for (let y = 2025; y <= currentYear + 1; y++) years.push(y);
  return years;
}
