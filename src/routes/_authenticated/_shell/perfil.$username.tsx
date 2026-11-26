import { createFileRoute, Link } from "@tanstack/react-router";
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
import { EditAvatarButton } from "@/components/edit-avatar-button";
import { useMediaUrl } from "@/lib/media";
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
  banner_url: string | null;
  banner_pos_x?: number;
  banner_pos_y?: number;
  banner_zoom?: number;
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
  const [editingGenres, setEditingGenres] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

  const profile = useQuery({
    queryKey: ["public-profile", username],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, banner_url, banner_pos_x, banner_pos_y, banner_zoom")
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

  const availableGenres = [
    "Romance", "Romance Dark", "Fantasia", "Sobrenatural", "Mistério",
    "Terror", "Suspense", "Ficção científica", "Aventura", "Drama",
    "Clássicos", "Distopia", "Contemporâneo", "Histórico", "Policial",
  ];

  function startGenreEditing() {
    setSelectedGenres((genresQuery.data ?? []).map((item) => item.genre));
    setEditingGenres(true);
  }

  async function saveGenres() {
    if (!profileId || !isOwnProfile) return;
    try {
      const { error: deleteError } = await (supabase as any)
        .from("profile_genres").delete().eq("user_id", profileId);
      if (deleteError) throw deleteError;
      if (selectedGenres.length) {
        const { error: insertError } = await (supabase as any)
          .from("profile_genres")
          .insert(selectedGenres.map((genre) => ({ user_id: profileId, genre })));
        if (insertError) throw insertError;
      }
      await queryClient.invalidateQueries({ queryKey: ["profile-genres", profileId] });
      await genresQuery.refetch();
      setEditingGenres(false);
      toast.success("Seus gêneros favoritos foram atualizados!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar seus gêneros.");
    }
  }

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
    if (!profileId || !me?.id || isOwnProfile || busy) return;
    setBusy("friend");
    try {
      const refreshed = await friendship.refetch();
      if (refreshed.error || !refreshed.data) {
        throw refreshed.error ?? new Error("Não foi possível verificar a amizade. Tente novamente.");
      }
      const state = refreshed.data;

      if (state.kind === "none") {
        const myId = await getMyId();
        if (state.request) {
          const { error: removeError } = await supabase.from("friend_requests").delete().eq("id", state.request.id);
          if (removeError) throw removeError;
        }
        const { error } = await supabase.from("friend_requests").insert({ requester_id: myId, addressee_id: profileId, status: "pending" });
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
      await queryClient.invalidateQueries({ queryKey: ["friendship", me.id, profileId] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a amizade.");
    } finally {
      setBusy(null);
    }
  }

  if (profile.isLoading) return <div className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando perfil...</div>;
  if (profile.isError) return <EmptyState title="Não foi possível carregar o perfil">Tente novamente em alguns instantes.</EmptyState>;
  if (!profile.data) return <EmptyState title="Perfil não encontrado">Essa pessoa não foi encontrada no Book Society.</EmptyState>;

  const person = profile.data;
  const bannerImage = useMediaUrl(person.banner_url);
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
        <div className="relative min-h-[210px] overflow-hidden bg-gradient-to-r from-secondary via-background to-muted bg-cover bg-center px-5 py-7 text-foreground sm:min-h-[245px] sm:px-8" style={bannerImage ? { backgroundImage: `linear-gradient(rgba(255,248,237,.58), rgba(255,248,237,.72)), url("${bannerImage}")`, backgroundSize: `cover, ${person.banner_zoom ?? 100}%`, backgroundPosition: `center, ${person.banner_pos_x ?? 50}% ${person.banner_pos_y ?? 50}%` } : undefined}>
          <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 82% 20%, color-mix(in oklch, var(--primary) 14%, transparent), transparent 24%), linear-gradient(0deg, color-mix(in oklch, var(--primary) 5%, transparent), transparent)" }} />
          <div className="pointer-events-none absolute -right-8 -top-12 text-[170px] leading-none text-primary/10" aria-hidden="true">✦</div>
          <div className="relative flex h-full flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative shrink-0 self-start rounded-full border-4 border-background shadow-[0_8px_28px_rgba(70,30,25,.18)]">
              <UserAvatar profile={person} className="h-32 w-32 border-0 sm:h-40 sm:w-40" />
              {me?.id === person.id ? <EditAvatarButton className="absolute bottom-1 right-1" /> : null}
            </div>
            <div className="min-w-0 flex-1 self-center">
              <h1 className="font-display text-3xl font-semibold text-primary sm:text-4xl">{person.display_name || person.username}</h1>
              <p className="mt-1 text-sm font-medium text-muted-foreground">@{person.username}</p>
              <p className="mt-4 font-display text-lg italic text-primary">“Sonhe, leia, compartilhe...” ♡</p>
            </div>
            <div className="flex flex-wrap gap-2 self-end sm:max-w-[310px] sm:justify-end">
              {!isOwnProfile ? <>
                <Button variant="outline" className="rounded-full border-border bg-card/80 text-foreground hover:bg-accent hover:text-accent-foreground" disabled={!me?.id || busy !== null || friendship.isLoading} onClick={handleFriendAction}>
                  {friendState === "friends" ? <><UserCheck className="mr-2 h-4 w-4" /> Amigos</> : friendState === "incoming" ? <><Check className="mr-2 h-4 w-4" /> Aceitar Amizade</> : friendState === "outgoing" ? <><UserX className="mr-2 h-4 w-4" /> Pedido enviado</> : <><UserPlus className="mr-2 h-4 w-4" /> Adicionar Amizade</>}
                </Button>
                <Button className="rounded-full border-primary bg-primary text-primary-foreground hover:bg-primary/90" disabled={!me?.id || busy !== null || followStats.isLoading} onClick={toggleFollow}>
                  {followStats.data?.iFollow ? <Check className="mr-2 h-4 w-4" /> : <Star className="mr-2 h-4 w-4" />}
                  {followStats.data?.iFollow ? "Seguindo" : "Seguir"}
                </Button>
              </> : <span className="rounded-full border border-border bg-card/80 px-4 py-2 text-sm text-foreground">Este é o seu perfil</span>}
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

      <section className="overflow-hidden rounded-[1.5rem] border border-primary/15 bg-gradient-to-br from-card via-secondary/50 to-muted p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#ffe5ae] to-[#c87929] text-white shadow-inner sm:h-20 sm:w-20">
              <Award className="h-10 w-10 sm:h-12 sm:w-12" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="font-display text-2xl font-semibold text-primary sm:text-3xl">Minhas Conquistas</h2>
              <p className="mt-1 text-sm text-muted-foreground">Cada medalha conta um capítulo da sua jornada.</p>
            </div>
          </div>
          <span className="rounded-full border border-primary/20 bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground">
            <Star className="mr-1 inline h-4 w-4 fill-current" /> {badges.length} {badges.length === 1 ? "conquista" : "conquistas"}
          </span>
        </div>
        <div className="my-5 flex items-center gap-3 text-primary">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/40 to-primary/60" />
          <Heart className="h-5 w-5 fill-current" />
          <div className="h-px flex-1 bg-gradient-to-l from-transparent via-[#e68a91] to-[#b72a51]" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {achievementsQuery.isLoading ? <p className="col-span-full py-5 text-center text-sm text-muted-foreground">Carregando medalhas...</p> : badges.length ? badges.slice(0, 5).map((badge, index) => (
            <div key={badge.id} className="flex min-w-0 flex-col items-center rounded-2xl border border-primary/15 bg-card/80 px-2 py-4 text-center">
              <div className={`relative flex h-[76px] w-[76px] items-center justify-center rounded-full border-[3px] border-[#d9a45e] bg-gradient-to-br ${["from-amber-200 to-amber-600","from-stone-200 to-stone-500","from-yellow-200 to-yellow-600","from-orange-200 to-orange-600","from-amber-300 to-yellow-700"][index % 5]} shadow-[inset_0_2px_8px_rgba(255,255,255,.7),0_4px_10px_rgba(111,35,49,.12)] sm:h-[92px] sm:w-[92px]`}>
                <span className="absolute -top-2 text-lg text-primary">✦</span>
                <Award className="h-9 w-9 text-white drop-shadow sm:h-11 sm:w-11" strokeWidth={1.7} />
                <span className="absolute -bottom-2 text-lg text-[#9b2542]">✦</span>
              </div>
              <p className="mt-3 line-clamp-2 text-sm font-semibold leading-tight text-foreground">{badge.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{badge.description}</p>
              <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary"><span aria-hidden="true">▣</span> {new Date(badge.unlocked_at).toLocaleDateString("pt-BR")}</p>
            </div>
          )) : <p className="col-span-full py-6 text-center text-sm text-[#8c5360]">As medalhas conquistadas aparecerão aqui conforme você completar suas metas de leitura.</p>}
        </div>
        <div className="mt-5 flex justify-center">
          <Link to="/desafios" className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-6 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
            Ver todas as conquistas <span aria-hidden="true">›</span>
          </Link>
        </div>
      </section>

      <section className="grid gap-4 rounded-[1.4rem] border border-primary/15 bg-card p-5 shadow-sm lg:grid-cols-[.9fr_1.5fr]">
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-primary"><BookOpen className="h-5 w-5" /> O que gosto de ler</h2>
          <p className="mb-2 text-sm font-medium text-foreground">Meus gêneros favoritos:</p>
          <div className="flex flex-wrap gap-2">
            {genresQuery.isLoading ? <span className="text-xs text-muted-foreground">Carregando gêneros...</span> : genresQuery.data?.length ? genresQuery.data.map(({ id, genre }) => <span key={id} className="rounded-full border border-primary/10 bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground">{genre}</span>) : <span className="text-xs text-muted-foreground">Nenhum gênero favorito cadastrado ainda.</span>}
          </div>
          {isOwnProfile && <div className="mt-3">
            {!editingGenres ? <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={startGenreEditing}>Editar gêneros favoritos</Button> : <div className="space-y-3 rounded-xl border border-primary/15 bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground">Escolha os gêneros que combinam com suas leituras (até 8).</p>
              <div className="flex flex-wrap gap-2">
                {availableGenres.map((genre) => {
                  const checked = selectedGenres.includes(genre);
                  return <button key={genre} type="button" onClick={() => setSelectedGenres((current) => checked ? current.filter((item) => item !== genre) : current.length < 8 ? [...current, genre] : current)} className={`rounded-full border px-3 py-2 text-xs transition-colors ${checked ? "border-primary bg-primary text-primary-foreground" : "border-primary/15 bg-card text-foreground hover:bg-secondary"}`} aria-pressed={checked}>{genre}</button>;
                })}
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" className="rounded-full" onClick={saveGenres}>Salvar gêneros</Button>
                <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={() => setEditingGenres(false)}>Cancelar</Button>
              </div>
            </div>}
          </div>}
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
