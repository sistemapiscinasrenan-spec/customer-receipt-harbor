import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Charge, MessageTemplate } from "@/lib/billing-api";
import { toCents } from "@/lib/money";
import { formatDateBR } from "@/lib/months";
import {
  DEFAULT_TEMPLATES, MESSAGE_KINDS, formatPhone, normalizePhone, renderTemplate, suggestKind, todayISO,
  whatsappLink, type MessageKind,
} from "@/lib/whatsapp";

export function WhatsAppDialog({
  charge,
  clientPhone,
  templates,
  onOpenChange,
  onSavePhone,
}: {
  charge: Charge | null;
  clientPhone: string | null;
  templates: MessageTemplate[] | undefined;
  onOpenChange: (open: boolean) => void;
  onSavePhone: (clientId: string, phone: string) => Promise<void>;
}) {
  const open = charge !== null;
  const suggested = charge ? suggestKind(charge.due_date, todayISO()) : "reminder";
  const [kind, setKind] = useState<MessageKind>(suggested);
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [savePhone, setSavePhone] = useState(true);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const templateFor = useMemo(() => {
    const map = new Map((templates ?? []).map((t) => [t.kind, t.body]));
    return (k: MessageKind) => map.get(k) ?? DEFAULT_TEMPLATES[k];
  }, [templates]);

  function render(k: MessageKind) {
    if (!charge) return "";
    return renderTemplate(templateFor(k), {
      name: charge.client_name_snapshot,
      amountCents: toCents(charge.amount),
      dueDate: charge.due_date,
    });
  }

  useEffect(() => {
    if (!charge) return;
    setKind(suggested);
    setMessage(render(suggested));
    setPhone(formatPhone(clientPhone));
    setSavePhone(true);
    setPhoneError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charge?.id]);

  function chooseKind(k: MessageKind) {
    setKind(k);
    setMessage(render(k));
  }

  const normalized = normalizePhone(phone);
  const phoneChanged = normalized !== null && normalized !== clientPhone;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mensagem copiada.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  function handleOpenWhatsApp(e: React.MouseEvent) {
    if (!charge) return;
    if (!normalized) {
      e.preventDefault();
      setPhoneError("Informe o WhatsApp com DDD, por exemplo (11) 95844-3371.");
      return;
    }
    if (!message.trim()) {
      e.preventDefault();
      toast.error("Escreva a mensagem antes de enviar.");
      return;
    }
    if (phoneChanged && savePhone) {
      void onSavePhone(charge.client_id, normalized);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="size-5 text-success" /> Enviar cobrança por WhatsApp
          </DialogTitle>
          <DialogDescription>
            Escolha o modelo da mensagem para <strong className="text-foreground">{charge?.client_name_snapshot}</strong>
            {charge && <> · vencimento {formatDateBR(charge.due_date)}</>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Tipo de mensagem</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup">
              {MESSAGE_KINDS.map((k) => {
                const active = kind === k.kind;
                return (
                  <button
                    key={k.kind}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => chooseKind(k.kind)}
                    className={`rounded-lg border px-2 py-2 text-center text-sm font-medium transition-colors ${
                      active ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-accent"
                    }`}
                  >
                    {k.label}
                    {suggested === k.kind && <span className="block text-[11px] font-normal text-muted-foreground">sugerido</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="wa-phone">Enviar para</Label>
            <Input
              id="wa-phone"
              type="tel"
              inputMode="tel"
              placeholder="(11) 95844-3371"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setPhoneError(null); }}
              className="h-11 text-base sm:h-9 sm:text-sm"
            />
            {phoneError && <p className="text-xs text-danger">{phoneError}</p>}
            {!clientPhone && !phone && (
              <p className="text-xs text-muted-foreground">Este cliente ainda não tem WhatsApp no cadastro.</p>
            )}
            {phoneChanged && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={savePhone} onCheckedChange={(v) => setSavePhone(v === true)} />
                {clientPhone ? "Atualizar este número no cadastro do cliente" : "Salvar este número no cadastro do cliente"}
              </label>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="wa-message">Mensagem</Label>
              <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => setMessage(render(kind))}>
                Restaurar modelo
              </Button>
            </div>
            <Textarea
              id="wa-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={9}
              className="text-base sm:text-sm"
            />
            <p className="text-xs text-muted-foreground">A edição vale só para este envio; o modelo salvo não muda.</p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={copy}>
            <Copy /> Copiar mensagem
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="ghost" className="h-11 sm:h-9" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button asChild variant="success" className="h-11 sm:h-9">
              <a
                href={normalized ? whatsappLink(normalized, message) : "#"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleOpenWhatsApp}
              >
                <ExternalLink /> Abrir no WhatsApp
              </a>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
