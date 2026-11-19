import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone, renderTemplate, suggestKind, whatsappLink } from "@/lib/whatsapp";

describe("suggestKind", () => {
  it("suggests a reminder before the due date", () => {
    expect(suggestKind("2026-11-25", "2026-11-19")).toBe("reminder");
  });
  it("suggests 'vencimento hoje' on the due date", () => {
    expect(suggestKind("2026-11-19", "2026-11-19")).toBe("due_today");
  });
  it("suggests 'atraso' after the due date", () => {
    expect(suggestKind("2026-11-05", "2026-11-19")).toBe("overdue");
  });
});

describe("renderTemplate", () => {
  it("fills name, first name, value and due date in Brazilian format", () => {
    const text = renderTemplate("Olá, {primeiro_nome}! {nome} deve {valor} desde {vencimento}.", {
      name: "Maria Aparecida Silva",
      amountCents: 22000,
      dueDate: "2026-11-05",
    });
    expect(text).toBe("Olá, Maria! Maria Aparecida Silva deve R$ 220,00 desde 05/11/2026.");
  });
});

describe("normalizePhone", () => {
  it("adds the Brazil country code to a number typed with DDD", () => {
    expect(normalizePhone("(11) 95844-3371")).toBe("5511958443371");
  });
  it("keeps a number that already has 55", () => {
    expect(normalizePhone("+55 11 95844-3371")).toBe("5511958443371");
  });
  it("rejects a number without DDD", () => {
    expect(normalizePhone("95844-3371")).toBeNull();
  });
});

describe("whatsapp link", () => {
  it("opens the conversation with the message already typed", () => {
    expect(whatsappLink("5511958443371", "Olá, Kelly!")).toBe("https://wa.me/5511958443371?text=Ol%C3%A1%2C%20Kelly!");
  });
  it("shows the stored number in a readable format", () => {
    expect(formatPhone("5511958443371")).toBe("(11) 95844-3371");
  });
});
