import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarDays, Plus, Sparkles, Target, Trash2, Trophy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

type ReadingChallenge = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  goal_books: number;
  end_date: string;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/_shell/desafios")({
  head: () => ({ meta: [{ title: "Desafios — The Secret Bookshelf" }] }),
  component: DesafiosPage,
});

function DesafiosPage() {
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();
  const { data: userData } = useQuery({
    queryKey: ["challenge-current-user"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
  });
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["reading-challenges"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("reading_challenges")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReadingChallenge[];
    },
  });

  const { data: earnedAchievements = [], isLoading: achievementsLoading } = useQuery({
    queryKey: ["my-profile-achievements", userData?.id],
    enabled: Boolean(userData?.id),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profile_achievements")
        .select("id, achievement_key, title, description, unlocked_at")
        .eq("user_id", userData!.id)
        .order("unlocked_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; achievement_key: string; title: string; description: string; unlocked_at: string }[];
    },
  });

  async function removeChallenge(challenge: ReadingChallenge) {
    if (!window.confirm("Tem certeza de que deseja excluir este desafio?")) return;
    const { error } = await (supabase as any)
      .from("reading_challenges")
      .delete()
      .eq("id", challenge.id);
    if (error) {
      toast.error("Não foi possível excluir o desafio.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["reading-challenges"] });
    toast.success("Desafio excluído.");
  }

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight text-primary sm:text-4xl">
            Seu próximo capítulo
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Pequenas leituras. Grandes conquistas.
          </p>
        </div>
        <Button className="h-11 rounded-xl px-6 shadow-soft" onClick={() => setCreating(true)}>
          Personalizar meta
        </Button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <h2 className="font-display flex items-center gap-3 text-2xl text-primary">
          <Trophy className="h-6 w-6" /> Conquistas de leitura
        </h2>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {achievementsLoading ? (
            <p className="col-span-full py-5 text-center text-sm text-muted-foreground">Carregando suas medalhas...</p>
          ) : earnedAchievements.length ? earnedAchievements.map((achievement, index) => (
            <div key={achievement.id} className="flex flex-col items-center rounded-2xl border border-[#efc9c1] bg-gradient-to-b from-[#fff9f5] to-[#ffe9e3] p-4 text-center">
              <div className={`flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-[#d9a45e] bg-gradient-to-br ${["from-[#ffe5a8] to-[#c66b25]","from-[#f4e9e5] to-[#76615d]","from-[#fff0a8] to-[#d68a2d]","from-[#ffc4d2] to-[#b52657]","from-[#b6d8ff] to-[#245da6]"][index % 5]} shadow-inner`}>
                <Trophy className="h-8 w-8 text-white drop-shadow" />
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">{achievement.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{achievement.description}</p>
              <p className="mt-2 text-xs text-primary">{new Date(achievement.unlocked_at).toLocaleDateString("pt-BR")}</p>
            </div>
          )) : (
            <div className="col-span-full rounded-xl border border-dashed border-primary/25 bg-secondary/20 px-4 py-7 text-center">
              <Trophy className="mx-auto h-9 w-9 text-primary/50" />
              <p className="mt-2 font-medium text-foreground">Sua primeira medalha está esperando por você</p>
              <p className="mt-1 text-sm text-muted-foreground">Quando uma conquista for desbloqueada, ela aparecerá aqui e também no seu perfil.</p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <h2 className="flex items-center gap-3 text-xl font-semibold text-foreground">
          <Trophy className="h-6 w-6 text-primary" /> Sua próxima leitura
        </h2>
        <p className="mt-4 text-sm text-muted-foreground sm:text-base">
          Todo grande universo começa com a primeira página.
        </p>
        <div className="relative mt-5 flex h-28 items-center justify-between overflow-hidden rounded-xl bg-secondary/40 px-5">
          <Sparkles className="h-7 w-7 text-primary/70" />
          <BookOpen className="mr-1 h-16 w-16 text-primary" strokeWidth={1.35} />
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          Escolha uma meta e transforme sua próxima leitura em uma conquista.
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-medium text-primary">Desafios da comunidade</h2>
            <p className="mt-1 text-sm text-muted-foreground">Metas literárias para ler junto com outros leitores.</p>
          </div>
          <Button variant="outline" className="rounded-xl" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> Criar desafio
          </Button>
        </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
        </div>
      ) : isError ? (
        <EmptyState title="Não foi possível carregar os desafios">Tente novamente em instantes.</EmptyState>
      ) : data.length === 0 ? (
        <EmptyState title="Nenhum desafio por enquanto">
          Seja a primeira pessoa a criar um desafio de leitura para a comunidade!
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((challenge) => {
            const ended = challenge.end_date < new Date().toISOString().slice(0, 10);
            return (
              <Card key={challenge.id} className="overflow-hidden rounded-2xl border-border shadow-soft">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Trophy className="h-5 w-5" />
                    </div>
                    {userData?.id === challenge.owner_id ? (
                      <Button variant="ghost" size="icon" aria-label="Excluir desafio" onClick={() => void removeChallenge(challenge)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-semibold text-foreground">{challenge.title}</h2>
                    <p className="mt-1 min-h-10 whitespace-pre-wrap text-sm text-muted-foreground">
                      {challenge.description || "Sem descrição."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 border-t border-border pt-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5"><Target className="h-4 w-4 text-primary" /> {challenge.goal_books} {challenge.goal_books === 1 ? "livro" : "livros"}</span>
                    <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-primary" /> Até {new Date(`${challenge.end_date}T12:00:00`).toLocaleDateString("pt-BR")}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{challenge.owner_id === userData?.id ? "Criado por você" : "Desafio da comunidade"}</span>
                    <span className={ended ? "font-medium text-muted-foreground" : "font-medium text-primary"}>{ended ? "Encerrado" : "Em andamento"}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      </section>

      <CreateChallengeDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["reading-challenges"] })}
      />
    </div>
  );
}

function CreateChallengeDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalBooks, setGoalBooks] = useState("5");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error("Entre na sua conta para criar um desafio.");
      const { error } = await (supabase as any).from("reading_challenges").insert({
        owner_id: auth.user.id,
        title: title.trim(),
        description: description.trim(),
        goal_books: Number(goalBooks),
        end_date: endDate,
      });
      if (error) throw error;
      toast.success("Desafio criado com sucesso!");
      setTitle("");
      setDescription("");
      setGoalBooks("5");
      setEndDate("");
      onCreated();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o desafio.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-primary">Criar desafio</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="challenge-title">Nome do desafio</Label>
            <Input id="challenge-title" required minLength={3} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Maratona de fantasia" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="challenge-description">Descrição</Label>
            <Textarea id="challenge-description" rows={4} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Conte as regras e o objetivo do desafio..." />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="challenge-goal">Meta de livros</Label>
              <Input id="challenge-goal" type="number" min="1" max="100" required value={goalBooks} onChange={(e) => setGoalBooks(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="challenge-date">Data final</Label>
              <Input id="challenge-date" type="date" min={today} required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "Criando…" : "Criar desafio"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
