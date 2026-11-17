import { normalizeName } from "./finance";

export interface CommandCharge {
  id: string;
  client_name_snapshot: string;
  status: "pending" | "paid";
}

export type CommandResolution<T extends CommandCharge> =
  | { kind: "match"; term: string; charge: T }
  | { kind: "already_paid"; term: string; charge: T }
  | { kind: "choose"; term: string; candidates: T[] }
  | { kind: "not_found"; term: string };

const PAYMENT_WORDS =
  /\b(ja|já|tambem|também|pagou|pagaram|pago|pagos|paga|pagas|pagamento|pagamentos|fez|fizeram|o|a|os|as)\b/g;

/** Splits "Elias e Ana pagaram." into ["Elias", "Ana"]. */
export function parsePaymentCommand(text: string): string[] {
  const cleaned = text
    .replace(/[.!?;:]/g, " ")
    .replace(/\n/g, ",");
  const parts = cleaned.split(/,|\s+e\s+|\s*&\s*|\s*\+\s*/i);
  const terms: string[] = [];
  for (const part of parts) {
    const term = part
      .replace(new RegExp(PAYMENT_WORDS.source, "gi"), " ")
      .replace(/\s+/g, " ")
      .trim();
    if (term && !terms.some((t) => normalizeName(t) === normalizeName(term))) terms.push(term);
  }
  return terms;
}

/**
 * Matches each term against the month's charges. Never guesses: only an exact,
 * unique (accent/case-insensitive) name match is resolved automatically.
 */
export function resolvePaymentCommand<T extends CommandCharge>(
  text: string,
  charges: T[],
): CommandResolution<T>[] {
  return parsePaymentCommand(text).map((term) => {
    const q = normalizeName(term);
    const exact = charges.filter((c) => normalizeName(c.client_name_snapshot) === q);
    const partial = charges.filter((c) => {
      const name = normalizeName(c.client_name_snapshot);
      return name !== q && name.split(" ").some((_, i, words) => words.slice(i).join(" ").startsWith(q));
    });
    const charge = exact[0];
    if (exact.length === 1 && partial.length === 0 && charge) {
      return charge.status === "paid"
        ? { kind: "already_paid", term, charge }
        : { kind: "match", term, charge };
    }
    const candidates = [...exact, ...partial];
    if (candidates.length === 0) return { kind: "not_found", term };
    return { kind: "choose", term, candidates };
  });
}
