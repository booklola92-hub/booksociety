import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UserRound } from "lucide-react";

import { EmptyState, PageTitle } from "@/components/empty-state";
import { UserAvatar } from "@/components/user-avatar";
import { supabase } from "@/integrations/supabase/client";

type PublicProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

function PublicProfilePage() {
  const { username } = Route.useParams();

  const profile = useQuery({
    queryKey: ["public-profile", username],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_public_profiles", {
        _search: username,
        _limit: 30,
      });
      if (error) throw error;
      return ((data ?? []) as PublicProfile[]).find(
        (item) => item.username.toLowerCase() === username.toLowerCase(),
      ) ?? null;
    },
    enabled: Boolean(username),
  });

  if (profile.isLoading) {
    return (
      <div className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Carregando perfil...
      </div>
    );
  }

  if (profile.isError) {
    return (
      <EmptyState title="Não foi possível carregar o perfil">
        Tente novamente em alguns instantes.
      </EmptyState>
    );
  }

  if (!profile.data) {
    return <EmptyState title="Perfil não encontrado">Essa pessoa não foi encontrada no Book Society.</EmptyState>;
  }

  return (
    <div className="space-y-6">
      <PageTitle title="Perfil" subtitle="Conheça mais uma pessoa da comunidade Book Society." />
      <section className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <UserAvatar profile={profile.data} className="h-24 w-24 text-2xl" />
        <div>
          <h2 className="font-display text-2xl font-semibold text-foreground">
            {profile.data.display_name || profile.data.username}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">@{profile.data.username}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground">
          <UserRound className="h-4 w-4" />
          Pessoa cadastrada no Book Society
        </div>
      </section>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/perfil/$username")({
  head: () => ({ meta: [{ title: "Perfil — Book Society" }] }),
  component: PublicProfilePage,
});
