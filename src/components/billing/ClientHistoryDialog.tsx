import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { clientHistoryQuery, type Client } from "@/lib/billing-api";
import { summarize } from "@/lib/finance";
import { formatBRL, toCents } from "@/lib/money";
import { formatDateBR, formatTimestampBR, monthLabel } from "@/lib/months";
import { StatusBadge } from "./StatusBadge";

export function ClientHistoryDialog({ client, onOpenChange }: { client: Client | null; onOpenChange: (open: boolean) => void }) {
  const history = useQuery({ ...clientHistoryQuery(client?.id ?? ""), enabled: !!client });
  const s = summarize(history.data ?? []);

  return (
    <Dialog open={!!client} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Histórico — {client?.name}</DialogTitle>
          <DialogDescription>Todas as cobranças geradas para este cliente, com os valores de cada mês.</DialogDescription>
        </DialogHeader>
        {history.isPending ? (
          <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : history.isError ? (
          <p className="text-sm text-danger">{history.error.message}</p>
        ) : history.data.length === 0 ? (
          <p className="rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground">Nenhuma cobrança gerada ainda.</p>
        ) : (
          <>
            <div className="max-h-80 overflow-y-auto rounded-lg border">
              <ul className="divide-y text-sm">
                {history.data.map((c) => {
                  const y = Number(c.reference_month.slice(0, 4));
                  const m = Number(c.reference_month.slice(5, 7));
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{monthLabel(y, m)}</div>
                        <div className="text-xs text-muted-foreground">
                          Vence {formatDateBR(c.due_date)}
                          {c.paid_at ? ` · pago em ${formatTimestampBR(c.paid_at)}` : ""}
                        </div>
                      </div>
                      <span className="num font-semibold">{formatBRL(toCents(c.amount))}</span>
                      <StatusBadge status={c.status} />
                    </li>
                  );
                })}
              </ul>
            </div>
            <p className="num text-sm text-muted-foreground">
              Recebido {formatBRL(s.receivedCents)} · Pendente {formatBRL(s.pendingCents)}
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
