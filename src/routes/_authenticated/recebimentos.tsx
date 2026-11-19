import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { CalendarPlus, Loader2, MessageCircle, RefreshCw, RotateCcw, Search, Check } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/billing/AppShell";
import { GenerateDialog } from "@/components/billing/GenerateDialog";
import { QuickCommand } from "@/components/billing/QuickCommand";
import { StatusBadge } from "@/components/billing/StatusBadge";
import { SummaryCards } from "@/components/billing/SummaryCards";
import { WhatsAppDialog } from "@/components/billing/WhatsAppDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  clientsQuery, monthChargesQuery, setChargesStatus, setClientWhatsapp, templatesQuery, type Charge,
} from "@/lib/billing-api";
import { filterCharges, groupByDueDay, summarize, type StatusFilter } from "@/lib/finance";
import { formatBRL, toCents } from "@/lib/money";
import { MONTH_NAMES, currentMonth, formatTimestampBR, monthLabel, referenceMonth, yearOptions } from "@/lib/months";

const searchSchema = z.object({
  mes: z.number().int().min(1).max(12).optional().catch(undefined),
  ano: z.number().int().min(2000).max(2100).optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/recebimentos")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ mes: search.mes, ano: search.ano }),
  loader: ({ context, deps }) => {
    const now = currentMonth();
    const ref = referenceMonth(deps.ano ?? now.year, deps.mes ?? now.month);
    return context.queryClient.ensureQueryData(monthChargesQuery(ref));
  },
  head: () => ({
    meta: [
      { title: "Recebimentos — Gestão de Cobranças" },
      { name: "description", content: "Cobranças do mês agrupadas por vencimento, com pagos e pendentes." },
      { property: "og:title", content: "Recebimentos — Gestão de Cobranças" },
      { property: "og:description", content: "Cobranças do mês agrupadas por vencimento, com pagos e pendentes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  pendingComponent: () => (
    <AppShell>
      <div className="flex justify-center py-24 text-muted-foreground"><Loader2 className="size-6 animate-spin" /></div>
    </AppShell>
  ),
  errorComponent: ({ error }) => (
    <AppShell>
      <p className="rounded-lg bg-danger-soft p-4 text-sm text-danger">{error instanceof Error ? error.message : "Erro ao carregar."}</p>
    </AppShell>
  ),
  component: RecebimentosPage,
});

function RecebimentosPage() {
  return (
    <AppShell>
      <Recebimentos />
    </AppShell>
  );
}

function Recebimentos() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/recebimentos" });
  const queryClient = useQueryClient();
  const now = currentMonth();
  const month = search.mes ?? now.month;
  const year = search.ano ?? now.year;
  const ref = referenceMonth(year, month);
  const label = monthLabel(year, month);
  const query = monthChargesQuery(ref);
  const { data: charges, isFetching, refetch } = useSuspenseQuery(query);

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [term, setTerm] = useState("");
  const [generateOpen, setGenerateOpen] = useState(false);
  const busyRef = useRef(new Set<string>());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [whatsFor, setWhatsFor] = useState<Charge | null>(null);
  const clients = useQuery(clientsQuery());
  const templates = useQuery(templatesQuery());
  const phoneByClient = useMemo(
    () => new Map((clients.data ?? []).map((c) => [c.id, c.whatsapp])),
    [clients.data],
  );

  async function savePhone(clientId: string, phone: string) {
    try {
      await setClientWhatsapp(clientId, phone);
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("WhatsApp salvo no cadastro do cliente.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar o WhatsApp.");
    }
  }

  const summary = useMemo(() => summarize(charges), [charges]);
  const visible = useMemo(() => filterCharges(charges, filter, term), [charges, filter, term]);
  const groups = useMemo(() => groupByDueDay(visible), [visible]);
  const isPastMonth = year < now.year || (year === now.year && month < now.month);

  function setMonth(next: { mes?: number; ano?: number }) {
    navigate({ search: (prev) => ({ ...prev, mes: next.mes ?? month, ano: next.ano ?? year }) });
  }

  async function changeStatus(ids: string[], status: "paid" | "pending") {
    const target = ids.filter((id) => !busyRef.current.has(id));
    if (target.length === 0) return;
    target.forEach((id) => busyRef.current.add(id));
    setBusyIds(new Set(busyRef.current));

    const previous = queryClient.getQueryData<Charge[]>(query.queryKey);
    queryClient.setQueryData<Charge[]>(query.queryKey, (old) =>
      (old ?? []).map((c) =>
        target.includes(c.id)
          ? { ...c, status, paid_at: status === "paid" ? (c.paid_at ?? new Date().toISOString()) : null }
          : c,
      ),
    );

    try {
      const changed = await setChargesStatus(target, status);
      const byId = new Map(changed.map((c) => [c.id, c]));
      queryClient.setQueryData<Charge[]>(query.queryKey, (old) => (old ?? []).map((c) => byId.get(c.id) ?? c));
      if (changed.length < target.length) {
        await queryClient.invalidateQueries({ queryKey: query.queryKey });
      }
      queryClient.invalidateQueries({ queryKey: ["client-history"] });
      setFlashIds(new Set(changed.map((c) => c.id)));

      const names = changed.map((c) => c.client_name_snapshot).join(", ");
      if (changed.length === 0) {
        toast.info(status === "paid" ? "Essas cobranças já estavam pagas." : "Essas cobranças já estavam pendentes.");
      } else if (status === "paid") {
        toast.success(`${names}: ${changed.length === 1 ? "marcada como paga" : "marcadas como pagas"}.`, {
          action: { label: "Desfazer", onClick: () => void changeStatus(changed.map((c) => c.id), "pending") },
        });
      } else {
        toast(`${names}: ${changed.length === 1 ? "pagamento desfeito" : "pagamentos desfeitos"}.`);
      }
    } catch (err) {
      queryClient.setQueryData(query.queryKey, previous);
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar o pagamento.");
    } finally {
      target.forEach((id) => busyRef.current.delete(id));
      setBusyIds(new Set(busyRef.current));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Recebimentos</h1>
          <p className="mt-1 text-muted-foreground">{label}</p>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-center gap-2 sm:flex sm:flex-wrap">
          <Select value={String(month)} onValueChange={(v) => setMonth({ mes: Number(v) })}>
            <SelectTrigger className="h-11 w-full bg-card sm:h-9 sm:w-36" aria-label="Mês"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, i) => <SelectItem key={name} value={String(i + 1)}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setMonth({ ano: Number(v) })}>
            <SelectTrigger className="h-11 w-full bg-card sm:h-9 sm:w-24" aria-label="Ano"><SelectValue /></SelectTrigger>
            <SelectContent>
              {yearOptions(now.year).map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="size-11 sm:size-9" onClick={() => refetch()} aria-label="Atualizar dados" disabled={isFetching}>
            <RefreshCw className={isFetching ? "animate-spin" : ""} />
          </Button>
          <Button className="col-span-3 h-11 sm:h-9" onClick={() => setGenerateOpen(true)}>
            <CalendarPlus /> Gerar cobranças
          </Button>
        </div>
      </div>

      <SummaryCards summary={summary} />

      {charges.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <h2 className="text-lg font-semibold">Nenhuma cobrança em {label}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            As cobranças deste mês ainda não foram geradas. Gere a partir dos clientes ativos quando quiser começar.
          </p>
          <Button className="mt-5" onClick={() => setGenerateOpen(true)}><CalendarPlus /> Gerar cobranças de {label}</Button>
        </div>
      ) : (
        <>
          <QuickCommand charges={charges} onConfirm={(ids) => changeStatus(ids, "paid")} />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
              <TabsList className="grid h-11 w-full grid-cols-3 sm:inline-flex sm:h-9 sm:w-auto">
                <TabsTrigger value="all">Todos ({charges.length})</TabsTrigger>
                <TabsTrigger value="paid">Pagos ({summary.paidCount})</TabsTrigger>
                <TabsTrigger value="pending">Pendentes ({summary.pendingCount})</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar cliente" className="h-11 bg-card pl-9 text-base sm:h-9 sm:text-sm" aria-label="Buscar cliente" />
            </div>
          </div>

          {groups.length === 0 ? (
            <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Nenhum cliente encontrado com esses filtros.</p>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => {
                const all = charges.filter((c) => Number(c.due_date.slice(8, 10)) === group.day);
                const s = summarize(all);
                return (
                  <section key={group.day} className="overflow-hidden rounded-xl border bg-card shadow-card">
                    <header className="flex items-center justify-between gap-3 border-b bg-muted/50 px-4 py-2.5">
                      <h2 className="font-display text-base font-semibold">Dia {String(group.day).padStart(2, "0")}</h2>
                      <span className="num text-xs text-muted-foreground">
                        {s.paidCount} de {all.length} pagos · {formatBRL(s.totalCents)}
                      </span>
                    </header>
                    <ul className="divide-y">
                      {group.items.map((c) => {
                        const busy = busyIds.has(c.id);
                        return (
                          <li
                            key={`${c.id}-${flashIds.has(c.id) ? c.updated_at : ""}`}
                            className={`px-4 py-3 sm:flex sm:items-center sm:gap-3 ${flashIds.has(c.id) ? "animate-row-flash" : ""}`}
                          >
                            <div className="hidden w-24 shrink-0 sm:block"><StatusBadge status={c.status} /></div>
                            <div className="min-w-0 sm:flex-1">
                              <div className="break-words text-[15px] font-medium leading-snug sm:truncate sm:text-sm">{c.client_name_snapshot}</div>
                              {c.status === "paid" && c.paid_at && (
                                <div className="text-xs text-muted-foreground">Pago em {formatTimestampBR(c.paid_at)}</div>
                              )}
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2 sm:mt-0 sm:contents">
                              <div className="flex min-w-0 items-center gap-2 sm:hidden">
                                <StatusBadge status={c.status} />
                                <span className="num truncate text-sm font-semibold">{formatBRL(toCents(c.amount))}</span>
                              </div>
                              <div className="num hidden shrink-0 text-right font-semibold sm:block">{formatBRL(toCents(c.amount))}</div>
                              <div className="sm:flex sm:w-64 sm:shrink-0 sm:items-center sm:justify-end sm:gap-2">
                                {c.status === "pending" ? (
                                  <span className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="size-10 px-0 sm:h-8 sm:w-auto sm:px-3"
                                    onClick={() => setWhatsFor(c)}
                                    aria-label={`Enviar cobrança por WhatsApp para ${c.client_name_snapshot}`}
                                    title={phoneByClient.get(c.client_id) ? "Enviar cobrança por WhatsApp" : "Enviar cobrança por WhatsApp (sem número no cadastro)"}
                                  >
                                    <MessageCircle className={phoneByClient.get(c.client_id) ? "text-success" : "text-muted-foreground"} />
                                    <span className="hidden sm:inline">Cobrar</span>
                                  </Button>
                                  <Button size="sm" variant="soft-success" className="h-10 sm:h-8" disabled={busy} onClick={() => changeStatus([c.id], "paid")}>
                                    {busy ? <Loader2 className="animate-spin" /> : <Check />}
                                    <span className="hidden sm:inline">Marcar como pago</span>
                                    <span className="sm:hidden">Marcar pago</span>
                                  </Button>
                                  </span>
                                ) : (
                                  <Button size="sm" variant="ghost" className="h-10 text-muted-foreground sm:h-8" disabled={busy} onClick={() => changeStatus([c.id], "pending")}>
                                    {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                                    <span className="hidden sm:inline">Desfazer pagamento</span>
                                    <span className="sm:hidden">Desfazer</span>
                                  </Button>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      <WhatsAppDialog
        charge={whatsFor}
        clientPhone={whatsFor ? (phoneByClient.get(whatsFor.client_id) ?? null) : null}
        templates={templates.data}
        onOpenChange={(open) => !open && setWhatsFor(null)}
        onSavePhone={savePhone}
      />

      <GenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        referenceMonth={ref}
        label={label}
        isPastMonth={isPastMonth}
        existing={charges}
      />
    </div>
  );
}
