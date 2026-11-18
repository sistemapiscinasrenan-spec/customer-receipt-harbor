import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { clientsQuery, generateCharges, type Charge } from "@/lib/billing-api";
import { formatBRL, toCents } from "@/lib/money";

export function GenerateDialog({
  open,
  onOpenChange,
  referenceMonth,
  label,
  isPastMonth,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referenceMonth: string;
  label: string;
  isPastMonth: boolean;
  existing: Charge[];
}) {
  const queryClient = useQueryClient();
  const clients = useQuery({ ...clientsQuery(), enabled: open });
  const [busy, setBusy] = useState(false);

  const existingIds = new Set(existing.map((c) => c.client_id));
  const missing = (clients.data ?? []).filter((c) => c.is_active && !existingIds.has(c.id));
  const totalCents = missing.reduce((sum, c) => sum + toCents(c.recurring_amount), 0);

  async function handleGenerate() {
    setBusy(true);
    try {
      const created = await generateCharges(referenceMonth);
      await queryClient.invalidateQueries({ queryKey: ["charges", referenceMonth] });
      await queryClient.invalidateQueries({ queryKey: ["client-history"] });
      toast.success(
        created === 0
          ? "Nenhuma cobrança nova: todas já existiam."
          : `${created} ${created === 1 ? "cobrança gerada" : "cobranças geradas"} para ${label}.`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar as cobranças.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerar cobranças de {label}</DialogTitle>
          <DialogDescription>
            Cria uma cobrança para cada cliente ativo que ainda não tem cobrança neste mês. Cobranças já
            geradas não são alteradas.
          </DialogDescription>
        </DialogHeader>
        {clients.isPending ? (
          <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : clients.isError ? (
          <p className="text-sm text-danger">{clients.error.message}</p>
        ) : missing.length === 0 ? (
          <p className="rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground">
            Todas as cobranças de clientes ativos deste mês já foram geradas.
          </p>
        ) : (
          <div className="space-y-3">
            {isPastMonth && (
              <p className="flex gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                Este mês já passou. As cobranças usarão os valores e vencimentos atuais do cadastro.
              </p>
            )}
            <div className="max-h-64 overflow-y-auto rounded-lg border">
              <ul className="divide-y text-sm">
                {missing.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 break-words sm:truncate">{c.name}</span>
                    <span className="num shrink-0 text-muted-foreground">
                      dia {String(c.due_day).padStart(2, "0")} · {formatBRL(toCents(c.recurring_amount))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-sm">
              <strong>{missing.length}</strong> {missing.length === 1 ? "cobrança" : "cobranças"} · total{" "}
              <strong className="num">{formatBRL(totalCents)}</strong>
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={handleGenerate} disabled={busy || missing.length === 0 || clients.isPending}>
            {busy && <Loader2 className="animate-spin" />}
            Gerar {missing.length > 0 ? missing.length : ""} {missing.length === 1 ? "cobrança" : "cobranças"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
