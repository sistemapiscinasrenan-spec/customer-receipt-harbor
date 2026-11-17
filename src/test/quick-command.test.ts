import { describe, expect, it } from "vitest";
import { parsePaymentCommand, resolvePaymentCommand, type CommandCharge } from "@/lib/quick-command";

const charges: CommandCharge[] = [
  { id: "ana", client_name_snapshot: "Ana", status: "pending" },
  { id: "elias", client_name_snapshot: "Elias", status: "pending" },
  { id: "casquinha", client_name_snapshot: "Casquinha", status: "paid" },
  { id: "renata", client_name_snapshot: "Renata", status: "pending" },
  { id: "renata-c", client_name_snapshot: "Renata Cavalari", status: "pending" },
  { id: "lucia", client_name_snapshot: "Lúcia", status: "pending" },
  { id: "guilherme", client_name_snapshot: "Guilherme Barion", status: "pending" },
];

describe("quick payment command", () => {
  it("splits several names", () => {
    expect(parsePaymentCommand("Elias e Ana pagaram.")).toEqual(["Elias", "Ana"]);
    expect(parsePaymentCommand("Ana pagou")).toEqual(["Ana"]);
    expect(parsePaymentCommand("Ana, Elias e Ana pagaram")).toEqual(["Ana", "Elias"]);
  });

  it("resolves each exact name once", () => {
    const r = resolvePaymentCommand("Elias e Ana pagaram", charges);
    expect(r.map((x) => x.kind)).toEqual(["match", "match"]);
  });

  it("ignores accents and case", () => {
    const [r] = resolvePaymentCommand("lucia pagou", charges);
    expect(r?.kind).toBe("match");
  });

  it("asks for a choice when a name is ambiguous", () => {
    const [r] = resolvePaymentCommand("Renata pagou", charges);
    expect(r?.kind).toBe("choose");
    if (r?.kind === "choose") expect(r.candidates.map((c: CommandCharge) => c.id).sort()).toEqual(["renata", "renata-c"]);
  });

  it("never auto-selects a partial name", () => {
    const [r] = resolvePaymentCommand("Guilherme pagou", charges);
    expect(r?.kind).toBe("choose");
  });

  it("reports unknown names and already-paid charges", () => {
    const r = resolvePaymentCommand("Fulano e Casquinha pagaram", charges);
    expect(r[0]?.kind).toBe("not_found");
    expect(r[1]?.kind).toBe("already_paid");
  });
});
