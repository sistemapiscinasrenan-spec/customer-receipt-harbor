import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/billing/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { templatesQuery, updateTemplate } from "@/lib/billing-api";
import {
  DEFAULT_TEMPLATES, MESSAGE_KINDS, TEMPLATE_VARIABLES, renderTemplate, type MessageKind,
} from "@/lib/whatsapp";

export const Route = createFileRoute("/_authenticated/mensagens")({
  loader: ({ context }) => context.queryClient.ensureQueryData(templatesQuery()),
  head: () => ({
    meta: [
      { title: "Mensagens de cobrança — Gestão de Cobranças" },
      { name: "description", content: "Modelos de mensagem de WhatsApp para lembrete, vencimento e atraso." },
      { property: "og:title", content: "Mensagens de cobrança — Gestão de Cobranças" },
      { property: "og:description", content: "Modelos de mensagem de WhatsApp para lembrete, vencimento e atraso." },
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
      <Mensagens />
    </AppShell>
  ),
});

const SAMPLE = { name: "Maria Aparecida Silva", amountCents: 22000, dueDate: "2026-11-20" };

function Mensagens() {
  const { data: templates } = useSuspenseQuery(templatesQuery());
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">Mensagens</h1>
        <p className="mt-1 text-muted-foreground">
          Modelos usados no botão de WhatsApp dos recebimentos pendentes. Na hora de enviar você ainda pode editar o texto.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-4 text-sm shadow-card">
        <p className="font-medium">Campos que o app preenche sozinho</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {TEMPLATE_VARIABLES.map((v) => (
            <li key={v.tag} className="rounded-md bg-muted px-2 py-1 text-xs">
              <code className="font-semibold">{v.tag}</code> <span className="text-muted-foreground">{v.label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Para negrito no WhatsApp, coloque o texto entre asteriscos: *assim*.</p>
      </div>
      <div className="space-y-4">
        {MESSAGE_KINDS.map((k) => (
          <TemplateEditor
            key={k.kind}
            kind={k.kind}
            label={k.label}
            hint={k.hint}
            saved={templates.find((t) => t.kind === k.kind)?.body ?? DEFAULT_TEMPLATES[k.kind]}
          />
        ))}
      </div>
    </div>
  );
}

function TemplateEditor({ kind, label, hint, saved }: { kind: MessageKind; label: string; hint: string; saved: string }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState(saved);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setBody(saved), [saved]);
  const dirty = body !== saved;

  function insert(tag: string) {
    const el = ref.current;
    if (!el) return setBody((b) => b + tag);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + tag + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    });
  }

  async function save() {
    if (!body.trim()) {
      toast.error("O modelo não pode ficar vazio.");
      return;
    }
    setBusy(true);
    try {
      await updateTemplate(kind, body);
      await queryClient.invalidateQueries({ queryKey: templatesQuery().queryKey });
      toast.success(`Modelo "${label}" salvo.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-card">
      <header className="border-b bg-muted/50 px-4 py-2.5">
        <h2 className="font-display text-base font-semibold">{label}</h2>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </header>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <div className="space-y-2">
          <Textarea ref={ref} value={body} onChange={(e) => setBody(e.target.value)} rows={9} className="text-base sm:text-sm" aria-label={`Modelo ${label}`} />
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATE_VARIABLES.map((v) => (
              <Button key={v.tag} type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => insert(v.tag)}>
                + {v.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Exemplo de como fica</p>
          <div className="whitespace-pre-wrap rounded-lg bg-success-soft p-3 text-sm">{renderTemplate(body, SAMPLE)}</div>
        </div>
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t px-4 py-3 sm:flex-row sm:justify-end">
        <Button variant="ghost" className="h-11 sm:h-9" onClick={() => setBody(DEFAULT_TEMPLATES[kind])} disabled={busy}>
          <RotateCcw /> Texto padrão
        </Button>
        <Button className="h-11 sm:h-9" onClick={save} disabled={busy || !dirty}>
          {busy ? <Loader2 className="animate-spin" /> : <Save />} Salvar modelo
        </Button>
      </footer>
    </section>
  );
}
