import { toCents } from "./money";

export type ChargeStatus = "pending" | "paid";

export interface ChargeLike {
  id: string;
  amount: number | string;
  status: ChargeStatus;
  due_date: string; // YYYY-MM-DD
}

export interface MonthSummary {
  totalCents: number;
  receivedCents: number;
  pendingCents: number;
  paidCount: number;
  pendingCount: number;
  /** Percentage received, 0–100. 0 when nothing is billed. */
  percentReceived: number;
}

/** Computes month indicators from the individual charge rows. */
export function summarize(charges: ChargeLike[]): MonthSummary {
  let receivedCents = 0;
  let pendingCents = 0;
  let paidCount = 0;
  let pendingCount = 0;
  for (const c of charges) {
    const cents = toCents(c.amount);
    if (c.status === "paid") {
      receivedCents += cents;
      paidCount += 1;
    } else {
      pendingCents += cents;
      pendingCount += 1;
    }
  }
  const totalCents = receivedCents + pendingCents;
  const percentReceived = totalCents === 0 ? 0 : (receivedCents / totalCents) * 100;
  return { totalCents, receivedCents, pendingCents, paidCount, pendingCount, percentReceived };
}

/** Formats a percentage with one decimal in pt-BR, e.g. 68.698 -> "68,7%". */
export function formatPercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function dueDayOf(dueDate: string): number {
  return Number(dueDate.slice(8, 10));
}

export interface DueDayGroup<T> {
  day: number;
  items: T[];
}

/** Groups charges by due day, ascending, keeping the given order inside each day. */
export function groupByDueDay<T extends { due_date: string }>(charges: T[]): DueDayGroup<T>[] {
  const map = new Map<number, T[]>();
  for (const c of charges) {
    const day = dueDayOf(c.due_date);
    const list = map.get(day);
    if (list) list.push(c);
    else map.set(day, [c]);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([day, items]) => ({ day, items }));
}

export type StatusFilter = "all" | "paid" | "pending";

export function filterCharges<T extends { status: ChargeStatus; client_name_snapshot: string }>(
  charges: T[],
  filter: StatusFilter,
  search: string,
): T[] {
  const q = normalizeName(search);
  return charges.filter((c) => {
    if (filter !== "all" && c.status !== filter) return false;
    if (q && !normalizeName(c.client_name_snapshot).includes(q)) return false;
    return true;
  });
}

/** Lowercase, accent-free, single-spaced text for name comparison. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
