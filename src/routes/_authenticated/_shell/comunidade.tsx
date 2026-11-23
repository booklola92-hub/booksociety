import { Link, useNavigate } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { Lock, Plus, Search, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CommunityAvatar, CommunityCover, CoverFramer, DEFAULT_FRAMING, type CoverFraming } from "@/components/community-image";
import { EmptyState, PageTitle } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createCommunity, useCommunityList } from "@/lib/communities";
import { useInvalidate } from "@/lib/social";

export const Route = createFileRoute("/_authenticated/_shell/comunidade")({
  validateSearch: (s: Record<string, unknown>): { aba?: string } => (typeof s["aba"] === "string" ? { aba: s["aba"] } : {}),
  head: () => ({
    meta: [
      { title: "Comunidade — The Secret Bookshelf" },
      { name: "description", content: "Encontre e crie comunidades de leitores no The Secret Bookshelf." },
      { property: "og:title", content: "Comunidade — The Secret Bookshelf" },
      { property: "og:description", content: "Comunidades públicas e privadas de leitores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComunidadePage,
});

function ComunidadePage() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const { data = [], isLoading, isError } = useCommunityList(search);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Comunidade"
        subtitle="Grupos de leitores para conversar, trocar fotos e indicações."
        action={
          <Button className="rounded-full" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Criar comunidade
          </Button>
        }
      />
      <form
        className="relative max-w-lg"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
        }}
      >
        <Search className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome ou assunto"
          aria-label="Buscar comunidade"
          className="h-11 rounded-full bg-card pl-11 shadow-soft"
        />
      </form>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState title="Não foi possível carregar as comunidades">Tente novamente em instantes.</EmptyState>
      ) : data.length === 0 ? (
        <EmptyState title={search ? "Nenhuma comunidade encontrada" : "Nenhuma comunidade ainda"}>
          {search ? "Tente outro nome ou assunto." : "Crie a primeira comunidade!"}
        </EmptyState>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => (
            <Link
              key={c.id}
              to="/c/$slug"
              params={{ slug: c.slug }}
              className="group overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-transform hover:-translate-y-0.5"
            >
              <div className="h-28">
                <CommunityCover path={c.cover_url} framing={{ x: c.cover_pos_x, y: c.cover_pos_y, zoom: c.cover_zoom }} />
              </div>
              <div className="relative px-4 pb-4">
                <CommunityAvatar path={c.avatar_url} name={c.name} className="-mt-8 h-16 w-16" />
                <h2 className="font-display mt-2 flex items-center gap-1.5 text-xl font-semibold text-foreground">
                  {c.name} {c.is_private ? <Lock className="h-4 w-4 text-muted-foreground" aria-label="Privada" /> : null}
                </h2>
                <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">{c.description || "Sem descrição."}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {c.member_count} {c.member_count === 1 ? "membro" : "membros"}
                  </span>
                  <span className="font-medium text-primary">
                    {c.my_role ? "Você participa" : c.has_request ? "Solicitação enviada" : c.is_private ? "Privada" : "Pública"}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <CreateCommunityDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function CreateCommunityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [cover, setCover] = useState<File | null>(null);
  const [coverFraming, setCoverFraming] = useState<CoverFraming>(DEFAULT_FRAMING);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const invalidate = useInvalidate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-primary">Criar comunidade</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const c = await createCommunity({ name, description, isPrivate, cover, coverFraming });
              await invalidate("communities");
              toast.success("Comunidade criada!");
              onOpenChange(false);
              navigate({ to: "/c/$slug", params: { slug: c.slug } });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Não foi possível criar a comunidade.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="cc-name">Nome</Label>
            <Input id="cc-name" required minLength={3} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cc-desc">Descrição</Label>
            <Textarea id="cc-desc" maxLength={1000} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cc-cover">Capa (opcional)</Label>
            <Input id="cc-cover" type="file" accept="image/*" onChange={(e) => { setCover(e.target.files?.[0] ?? null); setCoverFraming(DEFAULT_FRAMING); }} />
            {cover ? <CoverFramer file={cover} path={null} value={coverFraming} onChange={setCoverFraming} /> : null}
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-medium">Comunidade privada</p>
              <p className="text-xs text-muted-foreground">Novos membros precisam ser aprovados.</p>
            </div>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} aria-label="Comunidade privada" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Criando…" : "Criar comunidade"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
