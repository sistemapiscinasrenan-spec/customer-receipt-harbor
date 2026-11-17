// All money math happens in integer cents to avoid floating-point drift.

/** Converts a numeric(10,2) value from the database (number or string) into integer cents. */
export function toCents(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const text = typeof value === "number" ? value.toFixed(2) : String(value).trim();
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error(`Valor monetário inválido: ${value}`);
  const [, sign, int, frac = ""] = match;
  const cents = Number(int) * 100 + Number(frac.padEnd(2, "0"));
  return sign ? -cents : cents;
}

/** Converts integer cents into the "1234.56" string accepted by numeric columns. */
export function centsToDecimalString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formats cents as Brazilian currency, e.g. 123456 -> "R$ 1.234,56". */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100).replace(/\u00a0/g, " ");
}

/**
 * Parses what a person types ("350", "350,00", "1.234,56", "R$ 220,5") into cents.
 * Returns null when the text is not a valid non-negative amount.
 */
export function parseBRLInput(input: string): number | null {
  const cleaned = input.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!cleaned) return null;
  let normalized: string;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  } else {
    normalized = cleaned;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return toCents(normalized);
}

/** Formats a cents value for an input field, e.g. 35000 -> "350,00". */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
