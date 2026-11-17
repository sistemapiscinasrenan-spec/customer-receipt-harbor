import { useState, type FormEvent } from "react";
import { CheckCircle2, Info, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { resolvePaymentCommand, type CommandResolution } from "@/lib/quick-command";
import type { Charge } from "@/lib/billing-api";
import { formatBRL, toCents } from "@/lib/money";
import { dueDayOf } from "@/lib/finance";
import { StatusBadge } from "./StatusBadge";

export function QuickCommand({
  charges,
  onConfirm,
}: {
  charges: Charge[];
  onConfirm: (ids: string[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<CommandResolution<Charge>[] | null>(null);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const r = resolvePaymentCommand(text, charges);
    setResults(r);
    setChecked(Object.fromEntries(r.map((x, i) => [i, x.kind === "match"])));
    setChoices({});
  }

  const selectedIds = [
    ...new Set(
      (results ?? []).flatMap((r, i) => {
        if (r.kind === "match" && checked[i]) return [r.charge.id];
        if (r.kind === "choose" && choices[i] && choices[i] !== "none") return [choices[i]];
        return [];
      }),
    ),
  ];

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm(selectedIds);
      setResults(null);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='Registro rápido: "Elias e Ana pagaram"'
            className="pl-9"
            aria-label="Registro rápido de pagamentos"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={!text.trim()}>Registrar</Button>
      </form>

      <Dialog open={results !== null} onOpenChange={(v) => !v && !busy && setResults(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar pagamentos</DialogTitle>
            <DialogDescription>Revise antes de salvar. Nada é alterado sem a sua confirmação.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-3">
            {(results ?? []).map((r, i) => (
              <li key={i} className="rounded-lg border p-3 text-sm">
                {r.kind === "match" && (
                  <label className="flex cursor-pointer items-center gap-3">
                    <Checkbox checked={!!checked[i]} onCheckedChange={(v) => setChecked((s) => ({ ...s, [i]: v === true }))} />
                    <CheckCircle2 className="size-4 text-success" />
                    <span className="flex-1 font-medium">{r.charge.client_name_snapshot}</span>
                    <span className="num text-muted-foreground">
                      dia {String(dueDayOf(r.charge.due_date)).padStart(2, "0")} · {formatBRL(toCents(r.charge.amount))}
                    </span>
                  </label>
                )}
                {r.kind === "already_paid" && (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Info className="size-4" />
                    <span className="flex-1"><strong className="text-foreground">{r.charge.client_name_snapshot}</strong> já está paga neste mês.</span>
                  </div>
                )}
                {r.kind === "not_found" && (
                  <div className="flex items-center gap-3 text-danger">
                    <XCircle className="size-4" />
                    <span>Nenhum cliente com cobrança neste mês corresponde a “{r.term}”. Corrija o nome.</span>
                  </div>
                )}
                {r.kind === "choose" && (
                  <div>
                    <p className="mb-2 font-medium">“{r.term}” pode ser mais de um cliente. Qual pagou?</p>
                    <RadioGroup value={choices[i] ?? ""} onValueChange={(v) => setChoices((s) => ({ ...s, [i]: v }))}>
                      {r.candidates.map((c) => (
                        <div key={c.id} className="flex items-center gap-3">
                          <RadioGroupItem value={c.id} id={`q-${i}-${c.id}`} disabled={c.status === "paid"} />
                          <Label htmlFor={`q-${i}-${c.id}`} className="flex flex-1 items-center justify-between gap-2 font-normal">
                            <span>{c.client_name_snapshot}</span>
                            <span className="flex items-center gap-2">
                              <span className="num text-muted-foreground">{formatBRL(toCents(c.amount))}</span>
                              <StatusBadge status={c.status} />
                            </span>
                          </Label>
                        </div>
                      ))}
                      <div className="flex items-center gap-3">
                        <RadioGroupItem value="none" id={`q-${i}-none`} />
                        <Label htmlFor={`q-${i}-none`} className="font-normal text-muted-foreground">Nenhum destes</Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResults(null)} disabled={busy}>Cancelar</Button>
            <Button variant="success" onClick={handleConfirm} disabled={busy || selectedIds.length === 0}>
              Marcar {selectedIds.length} como {selectedIds.length === 1 ? "paga" : "pagas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
