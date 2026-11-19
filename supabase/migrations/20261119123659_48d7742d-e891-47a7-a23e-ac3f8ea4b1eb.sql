ALTER TABLE public.clients ADD COLUMN whatsapp text;
ALTER TABLE public.clients ADD CONSTRAINT clients_whatsapp_digits CHECK (whatsapp IS NULL OR whatsapp ~ '^[0-9]{10,15}$');

CREATE TABLE public.message_templates (
  kind text PRIMARY KEY CHECK (kind IN ('reminder', 'due_today', 'overdue')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team reads templates" ON public.message_templates
  FOR SELECT TO authenticated USING (public.has_app_access(auth.uid()));
CREATE POLICY "Team updates templates" ON public.message_templates
  FOR UPDATE TO authenticated USING (public.has_app_access(auth.uid())) WITH CHECK (public.has_app_access(auth.uid()));

CREATE TRIGGER message_templates_set_updated_at BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.message_templates (kind, body) VALUES
('reminder', E'Olá, {primeiro_nome}! 😊\n\nPassando para lembrar que sua mensalidade vence em {vencimento}.\n\n💰 Valor: {valor}\n📅 Vencimento: {vencimento}\n\nQualquer dúvida, estou à disposição.'),
('due_today', E'Olá, {primeiro_nome}! 👋\n\nSua mensalidade vence hoje.\n\n💰 Valor: {valor}\n📅 Vencimento: {vencimento}\n\nSe já tiver pago, pode desconsiderar esta mensagem.'),
('overdue', E'Olá, {primeiro_nome}! ⚠️\n\nIdentificamos que sua mensalidade está em atraso.\n\n💰 Valor: {valor}\n📅 Venceu em: {vencimento}\n\nSe já tiver pago, pode desconsiderar esta mensagem.');