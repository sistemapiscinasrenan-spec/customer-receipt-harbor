import { formatBRL } from "@/lib/money";
import { formatDateBR } from "@/lib/months";

export type MessageKind = "reminder" | "due_today" | "overdue";

export const MESSAGE_KINDS: { kind: MessageKind; label: string; hint: string }[] = [
  { kind: "reminder", label: "Lembrete", hint: "Antes do vencimento" },
  { kind: "due_today", label: "Vencimento hoje", hint: "No dia do vencimento" },
  { kind: "overdue", label: "Atraso", hint: "Depois do vencimento" },
];

export const DEFAULT_TEMPLATES: Record<MessageKind, string> = {
  reminder:
    "Olá, {primeiro_nome}! 😊\n\nPassando para lembrar que sua mensalidade vence em {vencimento}.\n\n💰 Valor: {valor}\n📅 Vencimento: {vencimento}\n\nQualquer dúvida, estou à disposição.",
  due_today:
    "Olá, {primeiro_nome}! 👋\n\nSua mensalidade vence hoje.\n\n💰 Valor: {valor}\n📅 Vencimento: {vencimento}\n\nSe já tiver pago, pode desconsiderar esta mensagem.",
  overdue:
    "Olá, {primeiro_nome}! ⚠️\n\nIdentificamos que sua mensalidade está em atraso.\n\n💰 Valor: {valor}\n📅 Venceu em: {vencimento}\n\nSe já tiver pago, pode desconsiderar esta mensagem.",
};

export const TEMPLATE_VARIABLES = [
  { tag: "{primeiro_nome}", label: "Primeiro nome" },
  { tag: "{nome}", label: "Nome completo" },
  { tag: "{valor}", label: "Valor" },
  { tag: "{vencimento}", label: "Data de vencimento" },
] as const;

/** Today as YYYY-MM-DD in São Paulo time. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

/** Suggested message for a pending charge: before due → reminder, on the day → due today, after → overdue. */
export function suggestKind(dueDate: string, today: string): MessageKind {
  const due = dueDate.slice(0, 10);
  if (due > today) return "reminder";
  if (due === today) return "due_today";
  return "overdue";
}

export function renderTemplate(
  template: string,
  data: { name: string; amountCents: number; dueDate: string },
): string {
  const name = data.name.trim();
  const first = name.split(/\s+/)[0] ?? name;
  const values: Record<string, string> = {
    primeiro_nome: first,
    nome: name,
    valor: formatBRL(data.amountCents),
    vencimento: formatDateBR(data.dueDate),
  };
  return template.replace(/\{(primeiro_nome|nome|valor|vencimento)\}/g, (_, key: string) => values[key]);
}

/**
 * Normalizes a Brazilian phone to digits with country code (55 + DDD + number).
 * Returns null when it can't be a valid WhatsApp number.
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  return null;
}

/** 5511958443371 -> (11) 95844-3371 */
export function formatPhone(stored: string | null | undefined): string {
  if (!stored) return "";
  const local = stored.startsWith("55") && stored.length >= 12 ? stored.slice(2) : stored;
  const ddd = local.slice(0, 2);
  const rest = local.slice(2);
  if (rest.length === 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  if (rest.length === 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return stored;
}

export function whatsappLink(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
