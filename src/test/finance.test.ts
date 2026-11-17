import { describe, expect, it } from "vitest";
import { formatPercent, groupByDueDay, summarize, type ChargeLike } from "@/lib/finance";
import { formatBRL, parseBRLInput, toCents } from "@/lib/money";

const paid = (amount: number, day = 5): ChargeLike => ({
  id: crypto.randomUUID(), amount, status: "paid", due_date: `2026-11-${String(day).padStart(2, "0")}`,
});
const pending = (amount: number, day = 5): ChargeLike => ({ ...paid(amount, day), status: "pending" });

// November 2026 from the spec: 21 paid summing 6.650,00 and 13 pending summing 3.030,00.
const november: ChargeLike[] = [
  ...[350, 300, 200, 990, 200, 220, 220, 600, 250, 220, 180].map((v) => paid(v, 5)),
  pending(250, 5),
  ...[230, 900, 300, 250, 220, 220, 230, 200, 150].map((v) => paid(v, 10)),
  ...[180, 180, 220, 180].map((v) => pending(v, 15)),
  pending(200, 17),
  pending(220, 20), paid(220, 20), pending(230, 20), pending(220, 20), pending(500, 20),
  pending(200, 25), pending(230, 26), pending(220, 30),
];

describe("month indicators", () => {
  it("matches the November 2026 opening figures", () => {
    const s = summarize(november);
    expect(s.totalCents).toBe(968000);
    expect(s.receivedCents).toBe(665000);
    expect(s.pendingCents).toBe(303000);
    expect(s.paidCount).toBe(21);
    expect(s.pendingCount).toBe(13);
    expect(formatPercent(s.percentReceived)).toBe("68,7%");
  });

  it("marking a R$ 220,00 charge paid moves exactly 220 from pending to received", () => {
    const before = summarize(november);
    const idx = november.findIndex((c) => c.status === "pending" && c.amount === 220);
    const after = summarize(november.map((c, i) => (i === idx ? { ...c, status: "paid" as const } : c)));
    expect(after.receivedCents - before.receivedCents).toBe(22000);
    expect(before.pendingCents - after.pendingCents).toBe(22000);
    expect(after.totalCents).toBe(before.totalCents);
  });

  it("billed always equals received plus pending", () => {
    const s = summarize([paid(0.1), pending(0.2), paid(1234.56)]);
    expect(s.totalCents).toBe(s.receivedCents + s.pendingCents);
    expect(s.totalCents).toBe(123486);
  });

  it("shows 0% when nothing is billed", () => {
    const s = summarize([]);
    expect(s.percentReceived).toBe(0);
    expect(formatPercent(s.percentReceived)).toBe("0,0%");
  });

  it("groups charges by due day in ascending order", () => {
    const groups = groupByDueDay([pending(1, 20), paid(1, 5), pending(1, 10), paid(1, 5)]);
    expect(groups.map((g) => g.day)).toEqual([5, 10, 20]);
    expect(groups[0].items).toHaveLength(2);
  });
});

describe("money helpers", () => {
  it("formats Brazilian currency", () => {
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
    expect(formatBRL(968000)).toBe("R$ 9.680,00");
  });

  it("parses typed amounts into cents", () => {
    expect(parseBRLInput("350")).toBe(35000);
    expect(parseBRLInput("220,5")).toBe(22050);
    expect(parseBRLInput("R$ 1.234,56")).toBe(123456);
    expect(parseBRLInput("-10")).toBeNull();
    expect(parseBRLInput("abc")).toBeNull();
    expect(toCents("990.00")).toBe(99000);
  });
});
