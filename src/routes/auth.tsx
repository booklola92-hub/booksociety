import { LovableMark } from "@lovable.dev/cloud-auth-js/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import booksTeacup from "@/assets/books-teacup.png.asset.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

type Mode = "entrar" | "cadastro" | "esqueci";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { modo?: Mode } =>
    s["modo"] === "cadastro" || s["modo"] === "esqueci" || s["modo"] === "entrar" ? { modo: s["modo"] } : {},
  head: () => ({
    meta: [
      { title: "Entrar ou criar conta — The Secret Bookshelf" },
      { name: "description", content: "Crie sua conta gratuita ou entre na The Secret Bookshelf." },
      { property: "og:title", content: "Entrar ou criar conta — The Secret Bookshelf" },
      { property: "og:description", content: "Crie sua conta gratuita ou entre na The Secret Bookshelf." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function GoogleLogo() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
  );
}

function AuthPage() {
  const { modo } = Route.useSearch();
  const mode: Mode = modo ?? "entrar";
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<null | "confirm" | "reset">(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/inicio", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/inicio", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const setMode = (m: Mode) => {
    setSent(null);
    navigate({ to: "/auth", search: m === "entrar" ? {} : { modo: m }, replace: true });
  };

  async function social(provider: "google" | "lovable") {
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: `${window.location.origin}/auth` });
    if (result.error) toast.error("Não foi possível entrar. Tente novamente.");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message.includes("Invalid") ? "E-mail ou senha incorretos." : error.message);
      } else if (mode === "cadastro") {
        const clean = username.toLowerCase().replace(/[^a-z0-9_.]/g, "");
        if (clean.length < 3) throw new Error("O nome de usuário precisa ter pelo menos 3 letras ou números.");
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: { display_name: name.trim(), username: clean },
          },
        });
        if (error) throw error;
        setSent("confirm");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent("reset");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Algo deu errado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col items-center justify-center bg-secondary/60 p-10 lg:flex">
        <img src={booksTeacup.url} alt="" className="w-full max-w-md mix-blend-multiply" />
        <p className="font-display mt-4 max-w-sm text-center text-3xl text-foreground italic">
          Leia mais. Compartilhe mais. Faça parte.
        </p>
      </div>
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link to="/" className="font-display text-3xl font-semibold text-primary">
            The Secret Bookshelf
          </Link>

          {sent ? (
            <div className="mt-10 rounded-2xl border border-border bg-card p-6 text-center shadow-soft">
              <MailCheck className="mx-auto h-10 w-10 text-primary" />
              <h1 className="font-display mt-3 text-2xl font-semibold">Confira seu e-mail</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {sent === "confirm"
                  ? `Enviamos um link para ${email}. Clique nele para ativar sua conta e entrar.`
                  : `Enviamos um link para ${email} para você criar uma nova senha.`}
              </p>
              <Button variant="link" onClick={() => setMode("entrar")}>
                Voltar para entrar
              </Button>
            </div>
          ) : (
            <>
              <h1 className="font-display mt-8 text-4xl font-semibold">
                {mode === "entrar" ? "Bem-vinda de volta" : mode === "cadastro" ? "Crie sua conta" : "Esqueci minha senha"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "entrar"
                  ? "Entre para ver o que seus amigos estão lendo."
                  : mode === "cadastro"
                    ? "É grátis e leva menos de um minuto."
                    : "Digite seu e-mail para receber um link."}
              </p>

              {mode !== "esqueci" ? (
                <div className="mt-6 grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => social("google")}
                    className="h-11 border-[#747775] bg-[#FFFFFF] text-[#1F1F1F] hover:bg-[#FFFFFF]/90 hover:text-[#1F1F1F]"
                  >
                    <GoogleLogo /> Continuar com Google
                  </Button>
                  <Button type="button" variant="outline" className="h-11" onClick={() => social("lovable")}>
                    <LovableMark /> Continuar com Lovable
                  </Button>
                  <div className="my-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" /> ou com e-mail <span className="h-px flex-1 bg-border" />
                  </div>
                </div>
              ) : null}

              <form onSubmit={submit} className="mt-4 space-y-3">
                {mode === "cadastro" ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="name">Seu nome</Label>
                      <Input id="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="username">Nome de usuário</Label>
                      <Input
                        id="username"
                        required
                        maxLength={30}
                        value={username}
                        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
                        placeholder="ex.: pamela.leitora"
                      />
                    </div>
                  </>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {mode !== "esqueci" ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Senha</Label>
                      {mode === "entrar" ? (
                        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setMode("esqueci")}>
                          Esqueci minha senha
                        </button>
                      ) : null}
                    </div>
                    <Input
                      id="password"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                ) : null}
                <Button type="submit" disabled={busy} className="h-11 w-full rounded-full text-base">
                  {busy ? "Aguarde…" : mode === "entrar" ? "Entrar" : mode === "cadastro" ? "Criar conta" : "Enviar link"}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "entrar" ? (
                  <>
                    Ainda não tem conta?{" "}
                    <button className="font-medium text-primary hover:underline" onClick={() => setMode("cadastro")}>
                      Criar conta
                    </button>
                  </>
                ) : (
                  <>
                    Já tem conta?{" "}
                    <button className="font-medium text-primary hover:underline" onClick={() => setMode("entrar")}>
                      Entrar
                    </button>
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
