import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award, BookOpen, Bookmark, Check, Crown, Heart, MessageCircle, MoonStar,
  Star, Users, UserCheck, UserPlus, UserRound, UserX, Sparkles,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageTitle } from "@/components/empty-state";
import { Feed } from "@/components/feed";
import { UserAvatar } from "@/components/user-avatar";
import { BookCover } from "@/components/book-cover";
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
  bio: string | null;
};

type ShelfBook = {
  id: string;
  status: string;
  rating: number | null;
  book: { id: string; title: string; author: string; cover_url: string | null } | null;
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
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio")
        .eq("username", username)
        .single();
      if (error) throw error;
      return data as PublicProfile;
    },
    enabled: Boolean(username),
  });

  const profileId = profile.data?.id;
  const isOwnProfile = Boolean(me?.id && profileId && me.id === profileId);
  const followStats = useFollowStats(profileId);

  const shelf = useQuery({
    queryKey: ["profile-shelf", profileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shelf_items")
        .select("id, status, rating, book:books(id, title, author, cover_url)")
        .eq("user_id", profileId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ShelfBook[];
    },
  });

  const genresQuery = useQuery({
    queryKey: ["profile-genres", profileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profile_genres")
        .select("id, genre")
        .eq("user_id", profileId!)
        .order("genre");
      if (error) throw error;
      return (data ?? []) as { id: string; genre: string }[];
    },
  });

  const achievementsQuery = useQuery({
    queryKey: ["profile-achievements", profileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profile_achievements")
        .select("id, achievement_key, title, description, unlocked_at")
        .eq("user_id", profileId!)
        .order("unlocked_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; achievement_key: string; title: string; description: string; unlocked_at: string }[];
    },
  });

  const friendship = useQuery({
    queryKey: ["friendship", me?.id, profileId],
    enabled: Boolean(me?.id && profileId && !isOwnProfile),
    queryFn: async (): Promise<FriendshipState> => {
      const myId = await getMyId();
      const [outgoing, incoming] = await Promise.all([
        supabase.from("friend_requests").select("id, requester_id, addressee_id, status")
          .eq("requester_id", myId).eq("addressee_id", profileId!).maybeSingle(),
        supabase.from("friend_requests").select("id, requester_id, addressee_id, status")
          .eq("requester_id", profileId!).eq("addressee_id", myId).maybeSingle(),
      ]);
      if (outgoing.error) throw outgoing.error;
      if (incoming.error) throw incoming.error;
      const row = (outgoing.data ?? incoming.data) as Friendship | null;
      if (!row) return { kind: "none", request: null };
      if (row.status === "accepted") return { kind: "friends", request: row };
      if (row.status === "pending" && row.requester_id === myId) return { kind: "outgoing", request: row };
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
    } finally { setBusy(null); }
  }

  async function handleFriendAction() {
    if (!profileId || !friendship.data) return;
    const state = friendship.data;
    setBusy("friend");
    try {
      if (state.kind === "none") {
        const myId = await getMyId();
        if (state.request) {
          const { error } = await supabase.from("friend_requests").delete().eq("id", state.request.id);
          if (error) throw error;
        }
        const { error } = await supabase.from("friend_requests").insert({
          requester_id: myId, addressee_id: profileId, status: "pending",
        });
        if (error) throw error;
        toast.success("Solicitação de amizade enviada!");
      } else if (state.kind === "incoming") {
        const { error } = await supabase.from("friend_requests").update({ status: "accepted" }).eq("id", state.request.id);
        if (error) throw error;
        toast.success("Amizade aceita! Vocês agora são amigos.");
      } else {
        const { error } = await supabase.from("friend_requests").delete().eq("id", state.request.id);
        if (error) throw error;
        toast.success(state.kind === "friends" ? "Amizade desfeita." : "Solicitação cancelada.");
      }
      await queryClient.invalidateQueries({ queryKey: ["friendship", me?.id, profileId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a amizade.");
    } finally { setBusy(null); }
  }

  if (profile.isLoading) return <div className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando perfil...</div>;
  if (profile.isError) return <EmptyState title="Não foi possível carregar o perfil">Tente novamente em alguns instantes.</EmptyState>;
  if (!profile.data) return <EmptyState title="Perfil não encontrado">Essa pessoa não foi encontrada no Book Society.</EmptyState>;

  const person = profile.data;
  const friendState = friendship.data?.kind ?? "none";
  const entries = shelf.data ?? [];
  const readCount = entries.filter((item) => item.status === "read").length;
  const readingCount = entries.filter((item) => item.status === "reading").length;
  const favoriteBooks = entries.filter((item) => item.rating === 5 && item.book).slice(0, 5);
  const badges = achievementsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <PageTitle title="Perfil" subtitle="Um cantinho para compartilhar sua história e suas leituras." />

      <section className="relative overflow-hidden rounded-[1.6rem] border border-primary/15 bg-card shadow-sm">
        <div className="relative min-h-[190px] overflow-hidden bg-gradient-to-r from-[#4c1b19] via-[#7a3026] to-[#2e1715] px-5 py-7 text-white sm:min-h-[220px] sm:px-8">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 38px, rgba(255,220,170,.18) 39px 42px), linear-gradient(0deg, rgba(25,10,8,.7), transparent)" }} />
          <div className="relative flex h-full flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative shrink-0 self-start rounded-full border-4 border-[#fff3e8] shadow-lg">
              <UserAvatar profile={person} className="h-32 w-32 border-0 sm:h-40 sm:w-40" />
            </div>
            <div className="min-w-0 flex-1 self-center">
              <h1 className="font-display text-3xl font-semibold text-white sm:text-4xl">{person.display_name || person.username}</h1>
              <p className="mt-1 text-sm text-white/85">@{person.username}</p>
              <p className="mt-4 font-display text-lg italic text-[#ffe5c4]">“Sonhe, leia, compartilhe...” ♡</p>
            </div>
            <div className="flex flex-wrap gap-2 self-end sm:max-w-[310px] sm:justify-end">
              {!isOwnProfile ? <>
                <Button variant="outline" className="rounded-full border-white/70 bg-black/20 text-white hover:bg-white/15 hover:text-white" disabled={busy !== null || friendship.isLoading || friendship.isError} onClick={handleFriendAction}>
                  {friendState === "friends" ? <><UserCheck className="mr-2 h-4 w-4" /> Amigos</> : friendState === "incoming" ? <><Check className="mr-2 h-4 w-4" /> Aceitar Amizade</> : friendState === "outgoing" ? <><UserX className="mr-2 h-4 w-4" /> Pedido enviado</> : <><UserPlus className="mr-2 h-4 w-4" /> Adicionar Amizade</>}
                </Button>
                <Button className="rounded-full border border-white/70 bg-[#8d1d2d] text-white hover:bg-[#741625]" disabled={busy !== null || followStats.isLoading} onClick={toggleFollow}>
                  {followStats.data?.iFollow ? <Check className="mr-2 h-4 w-4" /> : <Star className="mr-2 h-4 w-4" />}
                  {followStats.data?.iFollow ? "Seguindo" : "Seguir"}
                </Button>
              </> : <span className="rounded-full border border-white/60 bg-black/20 px-4 py-2 text-sm text-white">Este é o seu perfil</span>}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <section className="grid gap-4 rounded-[1.4rem] border border-primary/15 bg-card p-5 shadow-sm sm:grid-cols-[1.25fr_.85fr]">
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-primary"><UserRound className="h-5 w-5" /> Quem sou eu</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{person.bio?.trim() || "Esta pessoa ainda não escreveu sua apresentação. Que tal contar um pouco sobre você e suas histórias favoritas?"}</p>
          </div>
          <div className="flex min-h-[110px] items-center justify-center rounded-xl bg-gradient-to-br from-secondary/70 to-[#f7e4d8] p-4 text-center">
            <div><BookOpen className="mx-auto h-12 w-12 text-primary/75" /><p className="mt-2 font-display text-sm italic text-primary">“Ler é viver outras vidas...”</p></div>
          </div>
        </section>

        <section className="rounded-[1.4rem] border border-primary/15 bg-card p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-primary"><Star className="h-5 w-5" /> Minha jornada de leitura</h2>
          <div className="grid grid-cols-3 divide-x divide-primary/25 text-center">
            <div className="px-2"><BookOpen className="mx-auto h-6 w-6 text-primary" /><p className="mt-2 text-2xl font-semibold text-primary">{shelf.isLoading ? "—" : readCount}</p><p className="text-sm text-muted-foreground">Lidos</p></div>
            <div className="px-2"><Bookmark className="mx-auto h-6 w-6 text-primary" /><p className="mt-2 text-2xl font-semibold text-primary">{shelf.isLoading ? "—" : readingCount}</p><p className="text-sm text-muted-foreground">Lendo</p></div>
            <div className="px-2"><Star className="mx-auto h-6 w-6 text-primary" /><p className="mt-2 text-2xl font-semibold text-primary">{shelf.isLoading ? "—" : favoriteBooks.length}</p><p className="text-sm text-muted-foreground">Favoritos</p></div>
          </div>
        </section>
      </div>

      <section className="rounded-[1.4rem] border border-primary/15 bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-primary"><Award className="h-5 w-5" /> Medalhas | Conquistas</h2>
          <span className="text-xs font-medium text-primary">Ver todas →</span>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {achievementsQuery.isLoading ? <p className="col-span-full py-5 text-center text-sm text-muted-foreground">Carregando conquistas...</p> : badges.length ? badges.map((badge) => (
            <div key={badge.id} className="flex min-w-0 flex-col items-center border-r border-primary/10 px-1 text-center last:border-0">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#d9a85d] bg-gradient-to-br from-[#fff0d7] to-[#e7c18b] shadow-inner sm:h-20 sm:w-20">
                <Award className="h-8 w-8 text-amber-700" />
              </div>
              <p className="mt-2 text-xs font-semibold leading-tight text-foreground">{badge.title}</p>
              <p className="mt-1 hidden text-[10px] leading-tight text-muted-foreground sm:block">{badge.description}</p>
            </div>
          )) : <p className="col-span-full py-5 text-center text-sm text-muted-foreground">As conquistas desbloqueadas aparecerão aqui.</p>}
        </div>
      </section>

      <section className="grid gap-4 rounded-[1.4rem] border border-primary/15 bg-card p-5 shadow-sm lg:grid-cols-[.9fr_1.5fr]">
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-primary"><BookOpen className="h-5 w-5" /> O que gosto de ler</h2>
          <p className="mb-2 text-sm font-medium text-foreground">Meus gêneros favoritos:</p>
          <div className="flex flex-wrap gap-2">
            {genresQuery.isLoading ? <span className="text-xs text-muted-foreground">Carregando gêneros...</span> : genresQuery.data?.length ? genresQuery.data.map(({ id, genre }) => <span key={id} className="rounded-full border border-primary/10 bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground">{genre}</span>) : <span className="text-xs text-muted-foreground">Nenhum gênero favorito cadastrado ainda.</span>}
          </div>
        </div>
        <div className="border-t border-primary/20 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <p className="mb-3 text-sm font-medium text-foreground">Meus livros favoritos:</p>
          {favoriteBooks.length ? <div className="flex flex-wrap gap-3">
            {favoriteBooks.map((item) => item.book && <div key={item.id} className="w-[68px]"><BookCover book={item.book} className="w-[68px] rounded-md" /><p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{item.book.title}</p></div>)}
          </div> : <p className="text-sm text-muted-foreground">Os livros avaliados com 5 estrelas aparecerão aqui.</p>}
        </div>
      </section>

      <section className="space-y-4 pt-1">
        <div className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-primary" /><h2 className="font-display text-2xl font-semibold text-primary">Publicações</h2></div>
        <Feed filter={{ kind: "user", userId: person.id }} empty={{ title: "Nenhuma publicação ainda", body: "Quando essa pessoa publicar algo que você tem permissão para ver, aparecerá aqui." }} />
      </section>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/perfil/$username")({
  head: () => ({ meta: [{ title: "Perfil — Book Society" }] }),
  component: PublicProfilePage,
});
