import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Client = Tables<"clients">;
export type Charge = Tables<"monthly_charges">;
export type MessageTemplate = Tables<"message_templates">;

const CHARGE_COLUMNS =
  "id, client_id, client_name_snapshot, amount, due_date, reference_month, status, paid_at, created_at, updated_at";

function fail(error: { message: string } | null, fallback: string): never {
  throw new Error(error?.message ? `${fallback}: ${error.message}` : fallback);
}

export const accessQuery = (userId: string) =>
  queryOptions({
    queryKey: ["access", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (error) fail(error, "Não foi possível verificar seu acesso");
      return { hasAccess: (data ?? []).length > 0, isAdmin: (data ?? []).some((r) => r.role === "admin") };
    },
  });

export const monthChargesQuery = (referenceMonth: string) =>
  queryOptions({
    queryKey: ["charges", referenceMonth],
    queryFn: async (): Promise<Charge[]> => {
      const { data, error } = await supabase
        .from("monthly_charges")
        .select(CHARGE_COLUMNS)
        .eq("reference_month", referenceMonth)
        .order("due_date", { ascending: true })
        .order("client_name_snapshot", { ascending: true });
      if (error) fail(error, "Não foi possível carregar as cobranças");
      return data ?? [];
    },
  });

export const clientsQuery = () =>
  queryOptions({
    queryKey: ["clients"],
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("due_day", { ascending: true })
        .order("name", { ascending: true });
      if (error) fail(error, "Não foi possível carregar os clientes");
      return data ?? [];
    },
  });

export const clientHistoryQuery = (clientId: string) =>
  queryOptions({
    queryKey: ["client-history", clientId],
    queryFn: async (): Promise<Charge[]> => {
      const { data, error } = await supabase
        .from("monthly_charges")
        .select(CHARGE_COLUMNS)
        .eq("client_id", clientId)
        .order("reference_month", { ascending: false });
      if (error) fail(error, "Não foi possível carregar o histórico");
      return data ?? [];
    },
  });

/**
 * Sets the status only when it is currently the opposite value, so repeated clicks
 * or duplicate requests can never count a payment twice. Returns the ids actually changed.
 */
export async function setChargesStatus(ids: string[], status: "paid" | "pending"): Promise<Charge[]> {
  if (ids.length === 0) return [];
  const from = status === "paid" ? "pending" : "paid";
  const { data, error } = await supabase
    .from("monthly_charges")
    .update({ status })
    .in("id", ids)
    .eq("status", from)
    .select(CHARGE_COLUMNS);
  if (error) fail(error, "Não foi possível atualizar o pagamento");
  return data ?? [];
}

export async function generateCharges(referenceMonth: string, clientIds?: string[]): Promise<number> {
  const { data, error } = await supabase.rpc("generate_monthly_charges", {
    p_month: referenceMonth,
    ...(clientIds ? { p_client_ids: clientIds } : {}),
  });
  if (error) fail(error, "Não foi possível gerar as cobranças");
  return data ?? 0;
}

export interface ClientInput {
  name: string;
  amountCents: number;
  dueDay: number;
  /** Digits with country code, or null when not informed. */
  whatsapp: string | null;
}

export async function createClient(input: ClientInput): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .insert({ name: input.name.trim(), recurring_amount: input.amountCents / 100, due_day: input.dueDay, whatsapp: input.whatsapp })
    .select("*")
    .single();
  if (error) fail(error, "Não foi possível cadastrar o cliente");
  return data;
}

export async function updateClient(id: string, input: ClientInput): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .update({ name: input.name.trim(), recurring_amount: input.amountCents / 100, due_day: input.dueDay, whatsapp: input.whatsapp })
    .eq("id", id)
    .select("*")
    .single();
  if (error) fail(error, "Não foi possível salvar o cliente");
  return data;
}

export async function setClientActive(id: string, isActive: boolean): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("*")
    .single();
  if (error) fail(error, "Não foi possível alterar a situação do cliente");
  return data;
}

/** Client ids that already have a charge in the given month. */
export async function clientIdsWithCharge(referenceMonth: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("monthly_charges")
    .select("client_id")
    .eq("reference_month", referenceMonth);
  if (error) fail(error, "Não foi possível consultar as cobranças do mês");
  return new Set((data ?? []).map((r) => r.client_id));
}

export async function setClientWhatsapp(id: string, whatsapp: string): Promise<Client> {
  const { data, error } = await supabase.from("clients").update({ whatsapp }).eq("id", id).select("*").single();
  if (error) fail(error, "Não foi possível salvar o WhatsApp do cliente");
  return data;
}

export const templatesQuery = () =>
  queryOptions({
    queryKey: ["message-templates"],
    queryFn: async (): Promise<MessageTemplate[]> => {
      const { data, error } = await supabase.from("message_templates").select("*");
      if (error) fail(error, "Não foi possível carregar os modelos de mensagem");
      return data ?? [];
    },
  });

export async function updateTemplate(kind: string, body: string): Promise<MessageTemplate> {
  const { data, error } = await supabase
    .from("message_templates")
    .update({ body })
    .eq("kind", kind)
    .select("*")
    .single();
  if (error) fail(error, "Não foi possível salvar o modelo");
  return data;
}
