import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarPlus, History, Loader2, MoreHorizontal, Pencil, Plus, Power, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/billing/AppShell";
import { ClientFormDialog } from "@/components/billing/ClientFormDialog";
import { ClientHistoryDialog } from "@/components/billing/ClientHistoryDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  clientsQuery, createClient, generateCharges, monthChargesQuery, setClientActive, updateClient,
  type Client, type ClientInput,
} from "@/lib/billing-api";
import { normalizeName } from "@/lib/finance";
import { formatBRL, toCents } from "@/lib/money";
import { currentMonth, formatTimestampBR, monthLabel, referenceMonth } from "@/lib/months";

export const Route = createFileRoute("/_authenticated/clientes")({
  loader: ({ context }) => context.queryClient.ensureQueryData(clientsQuery()),
  head: () => ({
    meta: [
      { title: "Clientes — Gestão de Cobranças" },
      { name: "description", content: "Cadastro de clientes recorrentes com valor mensal e dia de vencimento." },
      { property: "og:title", content: "Clientes — Gestão de Cobranças" },
      { property: "og:description", content: "Cadastro de clientes recorrentes com valor mensal e dia de vencimento." },
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
  component: () => (
    <AppShell>
      <Clientes />
    </AppShell>
  ),
});

type SituationFilter = "active" | "inactive" | "all";

function Clientes() {
  const queryClient = useQueryClient();
  const { data: clients } = useSuspenseQuery(clientsQuery());
  const now = currentMonth();
  const currentRef = referenceMonth(now.year, now.month);
  const currentLabel = monthLabel(now.year, now.month);
  const currentCharges = useQuery(monthChargesQuery(currentRef));
  const billedNow = new Set((currentCharges.data ?? []).map((c) => c.client_id));

  const [filter, setFilter] = useState<SituationFilter>("active");
  const [term, setTerm] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [historyOf, setHistoryOf] = useState<Client | null>(null);
  const [toggling, setToggling] = useState<Client | null>(null);
  const [including, setIncluding] = useState<Client | null>(null);
  const [busy, setBusy] = useState(false);

  const activeCount = clients.filter((c) => c.is_active).length;
  const activeTotal = clients.filter((c) => c.is_active).reduce((s, c) => s + toCents(c.recurring_amount), 0);

  const visible = useMemo(() => {
    const q = normalizeName(term);
    return clients.filter((c) => {
      if (filter === "active" && !c.is_active) return false;
      if (filter === "inactive" && c.is_active) return false;
      return !q || normalizeName(c.name).includes(q);
    });
  }, [clients, filter, term]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["clients"] }),
      queryClient.invalidateQueries({ queryKey: ["charges"] }),
      queryClient.invalidateQueries({ queryKey: ["client-history"] }),
    ]);
  }

  async function handleSubmit(input: ClientInput, includeNow: boolean) {
    try {
      if (editing) {
        await updateClient(editing.id, input);
        toast.success(`${input.name} atualizado. Cobranças já geradas não foram alteradas.`);
      } else {
        const created = await createClient(input);
        if (includeNow) {
          const n = await generateCharges(currentRef, [created.id]);
          toast.success(n > 0 ? `${created.name} cadastrado e incluído em ${currentLabel}.` : `${created.name} cadastrado.`);
        } else {
          toast.success(`${created.name} cadastrado. Entra nas próximas gerações de cobrança.`);
        }
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
      throw err;
    }
  }

  async function confirmToggle() {
    if (!toggling) return;
    setBusy(true);
    try {
      await setClientActive(toggling.id, !toggling.is_active);
      toast.success(toggling.is_active ? `${toggling.name} desativado. O histórico foi mantido.` : `${toggling.name} reativado.`);
      await refresh();
      setToggling(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível alterar a situação.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmInclude() {
    if (!including) return;
    setBusy(true);
    try {
      const n = await generateCharges(currentRef, [including.id]);
      toast.success(n > 0 ? `${including.name} incluído em ${currentLabel}.` : `${including.name} já tinha cobrança em ${currentLabel}.`);
      await refresh();
      setIncluding(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível incluir a cobrança.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Clientes</h1>
          <p className="num mt-1 text-muted-foreground">
            {activeCount} ativos · carteira mensal {formatBRL(activeTotal)}
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus /> Novo cliente</Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as SituationFilter)}>
          <TabsList>
            <TabsTrigger value="active">Ativos</TabsTrigger>
            <TabsTrigger value="inactive">Inativos</TabsTrigger>
            <TabsTrigger value="all">Todos</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar cliente" className="bg-card pl-9" aria-label="Buscar cliente" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        {visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
        ) : (
          <ul className="divide-y">
            <li className="hidden grid-cols-[1fr_6rem_7rem_7rem_7rem_3rem] gap-3 bg-muted/50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
              <span>Cliente</span><span>Vencimento</span><span className="text-right">Valor</span><span>Situação</span><span>Cadastro</span><span />
            </li>
            {visible.map((c) => (
              <li key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 md:grid-cols-[1fr_6rem_7rem_7rem_7rem_3rem]">
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground md:hidden">
                    Dia {String(c.due_day).padStart(2, "0")} · {formatBRL(toCents(c.recurring_amount))}
                  </div>
                </div>
                <span className="num hidden text-sm md:block">Dia {String(c.due_day).padStart(2, "0")}</span>
                <span className="num hidden text-right text-sm font-semibold md:block">{formatBRL(toCents(c.recurring_amount))}</span>
                <span className="hidden md:block">
                  {c.is_active ? <Badge variant="paid">Ativo</Badge> : <Badge variant="neutral">Inativo</Badge>}
                </span>
                <span className="num hidden text-sm text-muted-foreground md:block">
                  {formatTimestampBR(c.created_at)}
                  {c.deactivated_at && <span className="block text-xs">Encerrado {formatTimestampBR(c.deactivated_at)}</span>}
                </span>
                <div className="row-span-2 flex justify-end md:row-span-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Ações de ${c.name}`}><MoreHorizontal /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => { setEditing(c); setFormOpen(true); }}><Pencil /> Editar</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setHistoryOf(c)}><History /> Histórico de cobranças</DropdownMenuItem>
                      {c.is_active && currentCharges.isSuccess && !billedNow.has(c.id) && (
                        <DropdownMenuItem onSelect={() => setIncluding(c)}><CalendarPlus /> Incluir em {currentLabel}</DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setToggling(c)} className={c.is_active ? "text-danger focus:text-danger" : ""}>
                        <Power /> {c.is_active ? "Desativar" : "Reativar"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="md:hidden">
                  {c.is_active ? <Badge variant="paid">Ativo</Badge> : <Badge variant="neutral">Inativo</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ClientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        client={editing}
        currentMonthLabel={currentLabel}
        onSubmit={handleSubmit}
      />
      <ClientHistoryDialog client={historyOf} onOpenChange={(v) => !v && setHistoryOf(null)} />

      <AlertDialog open={!!toggling} onOpenChange={(v) => !v && !busy && setToggling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{toggling?.is_active ? `Desativar ${toggling?.name}?` : `Reativar ${toggling?.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {toggling?.is_active
                ? "O cliente deixa de entrar nas próximas gerações de cobrança. As cobranças e pagamentos já registrados continuam no histórico."
                : "O cliente volta a entrar nas próximas gerações de cobrança. Meses já gerados não são alterados."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmToggle(); }} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {toggling?.is_active ? "Desativar" : "Reativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!including} onOpenChange={(v) => !v && !busy && setIncluding(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Incluir {including?.name} em {currentLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Cria uma cobrança de {including ? formatBRL(toCents(including.recurring_amount)) : ""} com vencimento no dia{" "}
              {including ? String(including.due_day).padStart(2, "0") : ""}. Se já existir, nada é duplicado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmInclude(); }} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Incluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
