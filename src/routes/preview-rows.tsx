import { createFileRoute } from "@tanstack/react-router";
import { QuickCommand } from "@/components/billing/QuickCommand";
import type { Charge } from "@/lib/billing-api";

const charge = (
  id: string,
  name: string,
  amount: number,
  day: string,
  status: "pending" | "paid",
  paidAt: string | null = null,
): Charge => ({
  id,
  client_id: `c-${id}`,
  client_name_snapshot: name,
  amount,
  due_date: `2026-11-${day}`,
  reference_month: "2026-11",
  status,
  paid_at: paidAt,
  created_at: "2026-11-01T03:00:00.000Z",
  updated_at: "2026-11-01T03:00:00.000Z",
});

const charges: Charge[] = [
  charge("1", "Elias Pereira da Conceicao", 220, "20", "pending"),
  charge("2", "Ana Beatriz Nascimento", 230, "20", "pending"),
  charge("3", "Raimunda Nonata Vieira de Carvalho e Souza", 500, "20", "pending"),
  charge("4", "Maria Aparecida Gonçalves da Silva", 1230, "25", "paid", "2026-11-05T17:32:00.000Z"),
];

export const Route = createFileRoute("/preview-rows")({
  ssr: false,
  component: () => (
    <div className="mx-auto max-w-6xl p-4">
      <QuickCommand charges={charges} onConfirm={async () => {}} />
    </div>
  ),
});
