import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Heart, MessageCircle, UserCheck, UserPlus, Users, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageTitle } from "@/components/empty-state";
import { Feed } from "@/components/feed";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyId,
  setFollow,
  useFollowStats,
  useMe,
} from "@/lib/social";

type PublicProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
};

type FriendshipState =
  | { kind: "none"; request: Friendship | null }
  | { kind: "outgoing"; request: Friendship }
  | { kind: "incoming"; request: Friendship }
  | { kind: "friends"; request: Friendship };

function PublicProfilePage() {
  const { username } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [busy, setBusy] = useState<"follow" | "friend" | null>(null);

  const profile = useQuery({
    queryKey: ["public-profile", username],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_profile_by_username", { _username: username });
      if (error) throw error;
      return ((data ?? []) as PublicProfile[])[0] ?? null;
    },
    enabled: Boolean(username),
  });

  const profileId = profile.data?.id;
  const isOwnProfile = Boolean(me?.id && profileId && me.id === profileId);
  const followStats = useFollowStats(profileId);

  const friendship = useQuery({
    queryKey: ["friendship", me?.id, profileId],
    enabled: Boolean(me?.id && profileId && !isOwnProfile),
    queryFn: async (): Promise<FriendshipState> => {
      const myId = await getMyId();
      const [outgoing, incoming] = await Promise.all([
        supabase
          .from("friend_requests")
          .select("id, requester_id, addressee_id, status")
          .eq("requester_id", myId)
          .eq("addressee_id", profileId!)
          .maybeSingle(),
        supabase
          .from("friend_requests")
          .select("id, requester_id, addressee_id, status")
          .eq("requester_id", profileId!)
          .eq("addressee_id", myId)
          .maybeSingle(),
      ]);
      if (outgoing.error) throw outgoing.error;
      if (incoming.error) throw incoming.error;
      const row = (outgoing.data ?? incoming.data) as Friendship | null;
      if (!row) return { kind: "none", request: null };
      if (row.status === "accepted") return { kind: "friends", request: row };
      if (row.status === "pending" && row.requester_id === myId) {
        return { kind: "outgoing", request: row };
      }
      if (row.status === "pending") return { kind: "incoming", request: row };
      return { kind: "none", request: row };
    },
  });

  async function toggleFollow() {
    if (!profileId || !followStats.data) return;
    setBusy("follow");
    try {
      await setFollow(profileId, !followStats.data.iFollow);
      await queryClient.invalidateQueries({ queryKey: ["follow-stats", profileId] });
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o acompanhamento.");
    } finally {
      setBusy(null);
    }
  }

  async function handleFriendAction() {
    if (!profileId || !friendship.data) return;
    const state = friendship.data;
    setBusy("friend");
    try {
      if (state.kind === "none") {
        const myId = await getMyId();
        if (state.request) {
          const { error: removeRejectedError } = await supabase
            .from("friend_requests")
            .delete()
            .eq("id", state.request.id);
          if (removeRejectedError) throw removeRejectedError;
        }
        const { error } = await supabase.from("friend_requests").insert({
          requester_id: myId,
          addressee_id: profileId,
          status: "pending",
        });
        if (error) throw error;
        toast.success("Solicitação de amizade enviada!");
      } else if (state.kind === "incoming") {
        const { error } = await supabase
          .from("friend_requests")
          .update({ status: "accepted" })
          .eq("id", state.request.id);
        if (error) throw error;
        toast.success("Amizade aceita! Vocês agora são amigos.");
      } else {
        const { error } = await supabase
          .from("friend_requests")
          .delete()
          .eq("id", state.request.id);
        if (error) throw error;
        toast.success(state.kind === "friends" ? "Amizade desfeita." : "Solicitação cancelada.");
      }
      await queryClient.invalidateQueries({ queryKey: ["friendship", me?.id, profileId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a amizade.");
    } finally {
      setBusy(null);
    }
  }

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

  const person = profile.data;
  const friendState = friendship.data?.kind ?? "none";

  return (
    <div className="space-y-7">
      <PageTitle
        title="Perfil"
        subtitle="Conheça leitores, acompanhe suas publicações e faça novas amizades."
      />

      <section className="relative overflow-hidden rounded-[2rem] border border-border bg-card shadow-soft">
        <div className="h-28 bg-gradient-to-r from-primary/20 via-secondary to-accent/40 sm:h-36" />
        <div className="px-5 pb-6 sm:px-8">
          <div className="-mt-14 flex flex-col gap-5 sm:-mt-16 sm:flex-row sm:items-end">
            <div className="rounded-full border-4 border-card bg-card shadow-md">
              <UserAvatar profile={person} className="h-28 w-28 text-3xl sm:h-32 sm:w-32" />
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <h1 className="font-display text-3xl font-semibold text-primary">
                {person.display_name || person.username}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">@{person.username}</p>
            </div>
            {!isOwnProfile ? (
              <div className="flex flex-wrap items-center gap-2 pb-1">
                <Button
                  variant="outline"
                  className="rounded-full border-primary/40 bg-card/90 text-primary shadow-sm hover:bg-secondary"
                  disabled={busy !== null || friendship.isLoading || friendship.isError}
                  onClick={handleFriendAction}
                >
                  {friendState === "friends" ? (
                    <><UserCheck className="mr-2 h-4 w-4" /> Amigos</>
                  ) : friendState === "incoming" ? (
                    <><Check className="mr-2 h-4 w-4" /> Aceitar amizade</>
                  ) : friendState === "outgoing" ? (
                    <><UserX className="mr-2 h-4 w-4" /> Pedido enviado</>
                  ) : (
                    <><UserPlus className="mr-2 h-4 w-4" /> Adicionar Amizade</>
                  )}
                </Button>
                <Button
                  className="rounded-full shadow-sm"
                  disabled={busy !== null || followStats.isLoading}
                  onClick={toggleFollow}
                >
                  {followStats.data?.iFollow ? <Check className="mr-2 h-4 w-4" /> : <Heart className="mr-2 h-4 w-4" />}
                  {followStats.data?.iFollow ? "Deixar de seguir" : "Seguir"}
                </Button>
              </div>
            ) : (
              <span className="mb-1 rounded-full bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground">
                Este é o seu perfil
              </span>
            )}
          </div>

          <div className="mt-6 grid max-w-lg grid-cols-2 gap-3">
            <div className="rounded-2xl bg-secondary/60 p-4">
              <div className="flex items-center gap-2 text-primary">
                <Users className="h-4 w-4" />
                <span className="text-2xl font-semibold">{followStats.data?.followers ?? "—"}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Seguidores</p>
            </div>
            <div className="rounded-2xl bg-secondary/60 p-4">
              <div className="flex items-center gap-2 text-primary">
                <Heart className="h-4 w-4" />
                <span className="text-2xl font-semibold">{followStats.data?.following ?? "—"}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Seguindo</p>
            </div>
          </div>
          {friendship.isError ? (
            <p className="mt-3 text-xs text-destructive">Não foi possível carregar o status da amizade.</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          <h2 className="font-display text-2xl font-semibold text-primary">Publicações</h2>
        </div>
        <Feed
          filter={{ kind: "user", userId: person.id }}
          empty={{
            title: "Nenhuma publicação ainda",
            body: "Quando essa pessoa publicar algo que você tem permissão para ver, aparecerá aqui.",
          }}
        />
      </section>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/perfil/$username")({
  head: () => ({ meta: [{ title: "Perfil — Book Society" }] }),
  component: PublicProfilePage,
});
