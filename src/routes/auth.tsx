import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Waves } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar — Gestão de Cobranças" },
      { name: "description", content: "Acesse o controle de recebimentos e clientes recorrentes." },
      { property: "og:title", content: "Entrar — Gestão de Cobranças" },
      { property: "og:description", content: "Acesse o controle de recebimentos e clientes recorrentes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function safeRedirect(target: string | undefined): string {
  if (!target) return "/recebimentos";
  try {
    const url = new URL(target, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname.startsWith("/auth")) return "/recebimentos";
    return url.pathname + url.search;
  } catch {
    return "/recebimentos";
  }
}

function translateError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(message)) return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.";
  if (/already registered/i.test(message)) return "Este e-mail já possui conta. Use a opção Entrar.";
  if (/password should be at least/i.test(message)) return "A senha deve ter pelo menos 6 caracteres.";
  if (/rate limit/i.test(message)) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  return message;
}

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: safeRedirect(redirect), replace: true });
    });
  }, [navigate, redirect]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: safeRedirect(redirect), replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) {
          navigate({ to: "/recebimentos", replace: true });
        } else {
          setInfo("Conta criada. Enviamos um link de confirmação para o seu e-mail; depois de confirmar, entre aqui.");
          setMode("signin");
        }
      }
    } catch (err) {
      setError(translateError(err instanceof Error ? err.message : "Erro inesperado."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lift">
            <Waves className="size-6" />
          </span>
          <h1 className="mt-4 text-2xl font-semibold">Gestão de Cobranças</h1>
          <p className="mt-1 text-sm text-muted-foreground">Recebimentos e clientes recorrentes</p>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-card">
          <Tabs value={mode} onValueChange={(v) => { setMode(v as "signin" | "signup"); setError(null); }}>
            <TabsList className="mb-5 grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
          </Tabs>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            {info && <p className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">{info}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {mode === "signin" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
