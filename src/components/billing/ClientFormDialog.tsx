import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Client, ClientInput } from "@/lib/billing-api";
import { centsToInput, parseBRLInput, toCents } from "@/lib/money";

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
  currentMonthLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  currentMonthLabel: string;
  onSubmit: (input: ClientInput, includeCurrentMonth: boolean) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [includeNow, setIncludeNow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(client?.name ?? "");
    setAmount(client ? centsToInput(toCents(client.recurring_amount)) : "");
    setDueDay(client ? String(client.due_day) : "");
    setIncludeNow(false);
    setErrors({});
  }, [open, client]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const cents = parseBRLInput(amount);
    const day = Number(dueDay);
    if (!name.trim()) next.name = "Informe o nome do cliente.";
    if (cents === null) next.amount = "Informe um valor válido, por exemplo 220,00.";
    if (!Number.isInteger(day) || day < 1 || day > 31) next.dueDay = "Informe um dia entre 1 e 31.";
    setErrors(next);
    if (Object.keys(next).length > 0 || cents === null) return;
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), amountCents: cents, dueDay: day }, includeNow);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{client ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          <DialogDescription>
            {client
              ? "As alterações valem para as próximas cobranças. Cobranças já geradas não mudam."
              : "O cliente entra nas próximas gerações de cobrança."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="client-name">Nome</Label>
            <Input id="client-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            {errors.name && <p className="text-xs text-danger">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="client-amount">Valor mensal (R$)</Label>
              <Input id="client-amount" inputMode="decimal" placeholder="220,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {errors.amount && <p className="text-xs text-danger">{errors.amount}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-day">Dia de vencimento</Label>
              <Input id="client-day" type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
              {errors.dueDay && <p className="text-xs text-danger">{errors.dueDay}</p>}
            </div>
          </div>
          {!client && (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
              <Checkbox checked={includeNow} onCheckedChange={(v) => setIncludeNow(v === true)} className="mt-0.5" />
              <span>
                Incluir também na cobrança de <strong>{currentMonthLabel}</strong>
                <span className="block text-xs text-muted-foreground">Sem marcar, o cliente só entra a partir da próxima geração.</span>
              </span>
            </label>
          )}
          <p className="text-xs text-muted-foreground">Vencimentos em dias que o mês não tem (ex.: 31 em fevereiro) caem no último dia do mês.</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {client ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
