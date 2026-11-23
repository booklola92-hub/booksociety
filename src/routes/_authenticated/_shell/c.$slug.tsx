import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Lock, Settings, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CommunityAvatar, CommunityCover, CoverFramer, DEFAULT_FRAMING, type CoverFraming } from "@/components/community-image";
import { Composer } from "@/components/composer";
import { EmptyState } from "@/components/empty-state";
import { Feed } from "@/components/feed";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelJoinRequest,
  canSeeContent,
  deleteCommunity,
  decideRequest,
  isAdminRole,
  joinCommunity,
  leaveCommunity,
  removeMember,
  setMemberRole,
  updateCommunity,
  useCommunityDetail,
  useCommunityGallery,
  useCommunityMembers,
  useJoinRequests,
  type CommunityDetail,
} from "@/lib/communities";
import { useMediaUrl } from "@/lib/media";
import { useInvalidate } from "@/lib/social";

export const Route = createFileRoute("/_authenticated/_shell/c/$slug")({
  head: () => ({
    meta: [
      { title: "Comunidade — The Secret Bookshelf" },
      { name: "description", content: "Mural, membros e galeria de uma comunidade de leitores." },
      { property: "og:title", content: "Comunidade — The Secret Bookshelf" },
      { property: "og:description", content: "Mural, membros e galeria de uma comunidade de leitores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CommunityPage,
});

function useAct() {
  const invalidate = useInvalidate();
  return async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      await invalidate("communities", "feed", "posts");
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível concluir a ação.");
    }
  };
}

function CommunityPage() {
  const { slug } = Route.useParams();
  const { data: c, isLoading } = useCommunityDetail(slug);
  const act = useAct();
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();

  if (isLoading) return <Skeleton className="h-72 rounded-2xl" />;
  if (!c)
    return (
      <EmptyState title="Comunidade não encontrada">
        <Link to="/comunidade" className="text-primary hover:underline">Voltar para Comunidade</Link>
      </EmptyState>
    );

  const visible = canSeeContent(c);
  const admin = isAdminRole(c.my_role);

  return (
    <div className="space-y-6">
      <Link to="/comunidade" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ChevronLeft className="h-4 w-4" /> Comunidade
      </Link>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="h-40 sm:h-56">
          <CommunityCover path={c.cover_url} framing={{ x: c.cover_pos_x, y: c.cover_pos_y, zoom: c.cover_zoom }} />
        </div>
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end">
          <CommunityAvatar path={c.avatar_url} name={c.name} className="-mt-12 h-24 w-24" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display flex items-center gap-2 text-3xl font-semibold text-primary">
              {c.name} {c.is_private ? <Lock className="h-5 w-5 text-muted-foreground" aria-label="Privada" /> : null}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <Users className="mr-1 inline h-4 w-4" />
              {c.member_count} {c.member_count === 1 ? "membro" : "membros"} · {c.is_private ? "Privada" : "Pública"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.my_role === "owner" ? (
              <Button variant="outline" className="rounded-full" onClick={() => setEditing(true)}>
                <Settings className="h-4 w-4" /> Editar
              </Button>
            ) : null}
            {c.my_role === "owner" ? null : c.my_role ? (
              <Button variant="outline" className="rounded-full" onClick={() => act(() => leaveCommunity(c.id), "Você saiu da comunidade.")}>
                Sair
              </Button>
            ) : c.has_request ? (
              <Button variant="outline" className="rounded-full" onClick={() => act(() => cancelJoinRequest(c.id), "Solicitação cancelada.")}>
                Cancelar solicitação
              </Button>
            ) : (
              <Button
                className="rounded-full"
                onClick={() => act(() => joinCommunity(c), c.is_private ? "Solicitação enviada!" : "Você entrou na comunidade!")}
              >
                {c.is_private ? "Solicitar entrada" : "Participar"}
              </Button>
            )}
          </div>
        </div>
        {c.description ? <p className="border-t border-border px-5 py-4 text-sm whitespace-pre-line text-foreground/90">{c.description}</p> : null}
      </section>

      {!visible ? (
        <EmptyState title="Comunidade privada">
          O mural, os membros e a galeria ficam visíveis depois que um administrador aprovar sua entrada.
        </EmptyState>
      ) : (
        <Tabs defaultValue="mural">
          <TabsList className="flex-wrap">
            <TabsTrigger value="mural">Mural</TabsTrigger>
            <TabsTrigger value="membros">Membros</TabsTrigger>
            <TabsTrigger value="galeria">Galeria</TabsTrigger>
            {admin ? <TabsTrigger value="solicitacoes">Solicitações</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="mural" className="space-y-5 pt-4">
            {c.my_role ? (
              <Composer communityId={c.id} />
            ) : (
              <p className="rounded-xl border border-dashed border-border bg-card/60 p-4 text-center text-sm text-muted-foreground">
                Participe da comunidade para publicar, comentar e curtir.
              </p>
            )}
            <Feed filter={{ kind: "community", communityId: c.id }} empty={{ title: "Nenhuma publicação ainda", body: "Comece a conversa!" }} />
          </TabsContent>
          <TabsContent value="membros" className="pt-4">
            <Members community={c} />
          </TabsContent>
          <TabsContent value="galeria" className="pt-4">
            <Gallery communityId={c.id} />
          </TabsContent>
          {admin ? (
            <TabsContent value="solicitacoes" className="pt-4">
              <Requests communityId={c.id} />
            </TabsContent>
          ) : null}
        </Tabs>
      )}

      {c.my_role === "owner" ? <EditDialog community={c} open={editing} onOpenChange={setEditing} onDeleted={() => navigate({ to: "/comunidade" })} /> : null}
    </div>
  );
}

const ROLE_LABEL = { owner: "Dono(a)", admin: "Administrador(a)", member: "Membro" } as const;

function Members({ community: c }: { community: CommunityDetail }) {
  const { data = [], isLoading } = useCommunityMembers(c.id, true);
  const act = useAct();
  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  const groups = [
    { title: "Administração", list: data.filter((m) => m.role !== "member") },
    { title: "Membros", list: data.filter((m) => m.role === "member") },
  ];
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.title}>
          <h2 className="font-display mb-3 text-xl font-semibold text-primary">{g.title}</h2>
          {g.list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém por aqui ainda.</p>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {g.list.map((m) => (
                <li key={m.profile.id} className="flex flex-wrap items-center gap-3 p-3">
                  <Link to="/perfil/$username" params={{ username: m.profile.username }}>
                    <UserAvatar profile={m.profile} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link to="/perfil/$username" params={{ username: m.profile.username }} className="block truncate text-sm font-semibold hover:underline">
                      {m.profile.display_name || m.profile.username}
                    </Link>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {m.role !== "member" ? <ShieldCheck className="h-3 w-3" /> : null} {ROLE_LABEL[m.role]}
                    </span>
                  </div>
                  {c.my_role === "owner" && m.role !== "owner" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() =>
                        act(
                          () => setMemberRole(c.id, m.profile.id, m.role === "admin" ? "member" : "admin"),
                          m.role === "admin" ? "Administração removida." : "Administrador(a) nomeado(a).",
                        )
                      }
                    >
                      {m.role === "admin" ? "Remover administração" : "Tornar administrador(a)"}
                    </Button>
                  ) : null}
                  {(c.my_role === "owner" && m.role !== "owner") || (c.my_role === "admin" && m.role === "member") ? (
                    <Button size="sm" variant="ghost" className="rounded-full text-destructive" onClick={() => act(() => removeMember(c.id, m.profile.id), "Membro removido.")}>
                      Remover
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function GalleryImage({ path, alt }: { path: string; alt: string }) {
  const url = useMediaUrl(path);
  return url ? (
    <img src={url} alt={alt} loading="lazy" className="aspect-square w-full rounded-xl object-cover shadow-soft" />
  ) : (
    <div className="aspect-square w-full rounded-xl bg-muted" />
  );
}

function Gallery({ communityId }: { communityId: string }) {
  const { data = [], isLoading } = useCommunityGallery(communityId, true);
  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (data.length === 0) return <EmptyState title="Galeria vazia">As fotos publicadas no mural aparecem aqui.</EmptyState>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {data.map((p) => (
        <Link key={p.id} to="/publicacao/$postId" params={{ postId: p.id }}>
          <GalleryImage path={p.image_url!} alt={p.content ? p.content.slice(0, 80) : "Foto da comunidade"} />
        </Link>
      ))}
    </div>
  );
}

function Requests({ communityId }: { communityId: string }) {
  const { data = [], isLoading } = useJoinRequests(communityId, true);
  const act = useAct();
  if (isLoading) return <Skeleton className="h-32 rounded-2xl" />;
  if (data.length === 0) return <EmptyState title="Nenhuma solicitação pendente" />;
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
      {data.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
          <UserAvatar profile={r.profile} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.profile.display_name || r.profile.username}</span>
          <Button size="sm" className="rounded-full" onClick={() => act(() => decideRequest(r.id, true), "Entrada aprovada.")}>
            Aprovar
          </Button>
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => act(() => decideRequest(r.id, false), "Solicitação recusada.")}>
            Recusar
          </Button>
        </li>
      ))}
    </ul>
  );
}

function EditDialog({ community: c, open, onOpenChange, onDeleted }: { community: CommunityDetail; open: boolean; onOpenChange: (o: boolean) => void; onDeleted: () => void }) {
  const [name, setName] = useState(c.name);
  const [description, setDescription] = useState(c.description);
  const [isPrivate, setIsPrivate] = useState(c.is_private);
  const [cover, setCover] = useState<File | null>(null);
  const [coverFraming, setCoverFraming] = useState<CoverFraming>({ x: c.cover_pos_x, y: c.cover_pos_y, zoom: c.cover_zoom });
  const [avatar, setAvatar] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const act = useAct();
  const owner = c.my_role === "owner";
  if (!owner) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-primary">Editar comunidade</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await act(
              () =>
                updateCommunity(c.id, {
                  name,
                  description,
                  cover,
                  avatar,
                  coverFraming,
                  is_private: isPrivate,
                }),
              "Comunidade atualizada.",
            );
            setBusy(false);
            onOpenChange(false);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ec-name">Nome</Label>
            <Input id="ec-name" required minLength={3} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-desc">Descrição</Label>
            <Textarea id="ec-desc" maxLength={1000} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ec-cover">Nova capa</Label>
              <Input id="ec-cover" type="file" accept="image/*" onChange={(e) => { setCover(e.target.files?.[0] ?? null); setCoverFraming(DEFAULT_FRAMING); }} />
              <CoverFramer file={cover} path={c.cover_url} value={coverFraming} onChange={setCoverFraming} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-avatar">Nova foto de perfil</Label>
              <Input id="ec-avatar" type="file" accept="image/*" onChange={(e) => setAvatar(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          {owner ? (
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <p className="text-sm font-medium">Comunidade privada</p>
                <p className="text-xs text-muted-foreground">Só o dono pode mudar.</p>
              </div>
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} aria-label="Comunidade privada" />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <Button type="button" variant="destructive" disabled={busy} onClick={async () => {
              if (!window.confirm(`Excluir definitivamente a comunidade "${c.name}"? Esta ação não pode ser desfeita.`)) return;
              setBusy(true);
              try {
                await deleteCommunity(c.id);
                toast.success("Comunidade excluída.");
                onOpenChange(false);
                onDeleted();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Não foi possível excluir a comunidade.");
              } finally { setBusy(false); }
            }}>Excluir comunidade</Button>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
