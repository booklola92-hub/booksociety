import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Search, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { PageTitle } from "@/components/empty-state";
import { UserAvatar } from "@/components/user-avatar";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

type PublicProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

async function searchPeople(term: string): Promise<PublicProfile[]> {
  const { data, error } = await supabase.rpc("search_public_profiles", {
    _search: term.trim(),
    _limit: 30,
  });

  if (error) throw error;
  return (data ?? []) as PublicProfile[];
}

function ExplorePage() {
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const people = useQuery({
    queryKey: ["public-profile-search", term],
    queryFn: () => searchPeople(term),
    enabled: term.replace(/^@/, "").length >= 3,
    staleTime: 30_000,
  });
  const peopleResults = people.data ?? [];

  return (
    <div className="space-y-7">
      <PageTitle
        title="Explorar"
        subtitle="Encontre leitores e descubra novas pessoas para acompanhar no Book Society."
      />

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
      <section className="space-y-5 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex items-center gap-2 text-primary">
          <Users className="h-5 w-5" />
          <h2 className="font-display text-2xl font-semibold">Encontre pessoas</h2>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquise pelo nome ou @usuário..."
            aria-label="Pesquisar pessoas pelo nome ou nome de usuário"
            maxLength={80}
            className="h-12 rounded-xl pl-12"
          />
        </div>

        {term.replace(/^@/, "").length < 3 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/60 px-6 py-10 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium text-foreground">Encontre sua comunidade</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Digite pelo menos 3 letras do nome ou do @usuário. Só aparecem leitores que escolheram aparecer na busca.
            </p>
          </div>
        ) : people.isLoading ? (
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-border bg-background/60 px-5 py-10 text-sm text-muted-foreground" role="status">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
            Procurando pessoas...
          </div>
        ) : people.isError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
            {String((people.error as { message?: string } | null)?.message ?? "").includes("Muitas buscas")
              ? String((people.error as { message?: string }).message)
              : "Não foi possível pesquisar pessoas agora. Tente novamente."}
          </div>
        ) : peopleResults.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/60 px-6 py-10 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium text-foreground">Ninguém encontrado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Não encontramos leitores com esse nome que tenham escolhido aparecer na busca.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
            {peopleResults.map((person) => (
              <Link
                key={person.id}
                to="/perfil/$username"
                params={{ username: person.username }}
                className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-background p-4 transition hover:border-primary/40 hover:bg-accent/40"
              >
                <UserAvatar
                  profile={person}
                  className="h-12 w-12 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-foreground">
                    {person.display_name || person.username}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    @{person.username}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Link
        to="/buscar-obras"
        className="flex items-center justify-between gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md sm:p-7"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-xl font-semibold text-foreground">Buscar obras</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Encontre livros, novels, mangás, manhwas e webtoons.
            </span>
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
          Buscar obras
        </span>
      </Link>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/explorar")({
  validateSearch: (s: Record<string, unknown>): { q?: string } =>
    typeof s["q"] === "string" ? { q: s["q"] } : {},
  head: () => ({ meta: [{ title: "Explorar — Book Society" }] }),
  component: ExplorePage,
});
