import { CheckCircle2, CircleDollarSign, Clock, Percent } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatPercent, type MonthSummary } from "@/lib/finance";
import { formatBRL } from "@/lib/money";

export function SummaryCards({ summary }: { summary: MonthSummary }) {
  const count = summary.paidCount + summary.pendingCount;
  return (
    <section aria-label="Indicadores do mês" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card label="Total previsto" icon={<CircleDollarSign className="size-4" />} value={formatBRL(summary.totalCents)} hint={`${count} cobranças`} />
      <Card
        label="Total recebido"
        tone="success"
        icon={<CheckCircle2 className="size-4" />}
        value={formatBRL(summary.receivedCents)}
        hint={`${summary.paidCount} ${summary.paidCount === 1 ? "pagamento realizado" : "pagamentos realizados"}`}
      />
      <Card
        label="Total pendente"
        tone="danger"
        icon={<Clock className="size-4" />}
        value={formatBRL(summary.pendingCents)}
        hint={`${summary.pendingCount} ${summary.pendingCount === 1 ? "pagamento pendente" : "pagamentos pendentes"}`}
      />
      <div className="col-span-2 rounded-xl border bg-card p-4 shadow-card lg:col-span-1">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Percent className="size-4" /> Percentual recebido
        </div>
        <div className="num mt-2 font-display text-2xl font-semibold sm:text-3xl">{formatPercent(summary.percentReceived)}</div>
        <Progress value={summary.percentReceived} className="mt-3 h-2" aria-label="Percentual recebido" />
      </div>
    </section>
  );
}

function Card({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone?: "success" | "danger";
}) {
  const toneClass = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <div className={`flex items-center gap-2 text-sm font-medium ${tone ? toneClass : "text-muted-foreground"}`}>
        {icon} {label}
      </div>
      <div className={`num mt-2 font-display text-xl font-semibold sm:text-3xl ${toneClass}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
