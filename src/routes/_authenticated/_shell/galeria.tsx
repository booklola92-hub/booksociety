import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Images, Plus, ImagePlus, Trash2, ArrowLeft, X, FolderOpen } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { PageTitle } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia, useMediaUrl } from "@/lib/media";

type Album = { id: string; owner_id: string; title: string; cover_path: string | null; created_at: string };
type Photo = { id: string; album_id: string; owner_id: string; image_path: string; caption: string; created_at: string };

function GalleryPhoto({ photo, onDelete }: { photo: Photo; onDelete: (photo: Photo) => void }) {
  const url = useMediaUrl(photo.image_path);
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card">
      {url ? <img src={url} alt={photo.caption || "Foto do álbum"} className="aspect-square w-full object-cover" loading="lazy" /> : <div className="flex aspect-square items-center justify-center bg-secondary"><Images className="h-8 w-8 text-muted-foreground" /></div>}
      {photo.caption ? <p className="truncate px-3 py-2 text-sm text-muted-foreground">{photo.caption}</p> : null}
      <Button type="button" variant="destructive" size="icon" className="absolute right-2 top-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100" aria-label="Excluir foto" onClick={() => onDelete(photo)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function AlbumCover({ album }: { album: Album }) {
  const url = useMediaUrl(album.cover_path);
  return url ? <img src={url} alt="" className="aspect-[4/3] w-full object-cover" /> : <div className="flex aspect-[4/3] items-center justify-center bg-secondary"><FolderOpen className="h-10 w-10 text-primary/70" /></div>;
}

function GalleryPage() {
  const qc = useQueryClient();
  const [newAlbumOpen, setNewAlbumOpen] = useState(false);
  const [albumTitle, setAlbumTitle] = useState("");
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [caption, setCaption] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const albums = useQuery({
    queryKey: ["gallery-albums"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Entre na sua conta para abrir a galeria.");
      const { data, error } = await (supabase as any).from("gallery_albums").select("*").eq("owner_id", auth.user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Album[];
    },
  });
  const photos = useQuery({
    queryKey: ["gallery-photos", selectedAlbum?.id],
    enabled: !!selectedAlbum,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("gallery_photos").select("*").eq("album_id", selectedAlbum!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Photo[];
    },
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["gallery-albums"] });
    await qc.invalidateQueries({ queryKey: ["gallery-photos"] });
  };

  const createAlbum = useMutation({
    mutationFn: async () => {
      const title = albumTitle.trim();
      if (!title) throw new Error("Digite um nome para o álbum.");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Entre na sua conta para criar um álbum.");
      const { data, error } = await (supabase as any).from("gallery_albums").insert({ owner_id: auth.user.id, title }).select("*").single();
      if (error) throw error;
      return data as Album;
    },
    onSuccess: async (album) => {
      setAlbumTitle("");
      setNewAlbumOpen(false);
      await refresh();
      setSelectedAlbum(album);
      toast.success("Álbum criado!");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível criar o álbum."),
  });

  const addPhotos = useMutation({
    mutationFn: async (files: FileList) => {
      if (!selectedAlbum) throw new Error("Abra um álbum primeiro.");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Entre na sua conta para adicionar fotos.");
      const chosen = Array.from(files);
      if (chosen.length === 0) return;
      if (chosen.length > 30) throw new Error("Adicione no máximo 30 fotos por vez.");
      const paths: string[] = [];
      for (const file of chosen) paths.push(await uploadMedia(auth.user.id, file, `gallery/${selectedAlbum.id}`));
      const rows = paths.map((image_path) => ({ album_id: selectedAlbum.id, owner_id: auth.user!.id, image_path, caption: caption.trim() }));
      const { error } = await (supabase as any).from("gallery_photos").insert(rows);
      if (error) {
        await supabase.storage.from("media").remove(paths);
        throw error;
      }
      const cover_path = selectedAlbum.cover_path || paths[0];
      if (!selectedAlbum.cover_path) {
        await (supabase as any).from("gallery_albums").update({ cover_path }).eq("id", selectedAlbum.id);
        setSelectedAlbum({ ...selectedAlbum, cover_path: cover_path ?? null });
      }
    },
    onSuccess: async () => { setCaption(""); await refresh(); toast.success("Fotos adicionadas ao álbum!"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível adicionar as fotos."),
  });

  const deletePhoto = useMutation({
    mutationFn: async (photo: Photo) => {
      const { error } = await (supabase as any).from("gallery_photos").delete().eq("id", photo.id);
      if (error) throw error;
      await supabase.storage.from("media").remove([photo.image_path]);
      if (selectedAlbum?.cover_path === photo.image_path) {
        const remaining = (photos.data ?? []).filter((p) => p.id !== photo.id);
        const nextCover = remaining[0]?.image_path ?? null;
        await (supabase as any).from("gallery_albums").update({ cover_path: nextCover }).eq("id", selectedAlbum.id);
        setSelectedAlbum({ ...selectedAlbum, cover_path: nextCover });
      }
    },
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível excluir a foto."),
  });

  const deleteAlbum = useMutation({
    mutationFn: async (album: Album) => {
      const { data: rows, error: listError } = await (supabase as any).from("gallery_photos").select("image_path").eq("album_id", album.id);
      if (listError) throw listError;
      const { error } = await (supabase as any).from("gallery_albums").delete().eq("id", album.id);
      if (error) throw error;
      const paths = (rows ?? []).map((p: { image_path: string }) => p.image_path);
      if (paths.length) await supabase.storage.from("media").remove(paths);
    },
    onSuccess: async () => { setSelectedAlbum(null); await refresh(); toast.success("Álbum excluído."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível excluir o álbum."),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle title="Galeria" subtitle="Guarde suas fotos em álbuns especiais." />
        {selectedAlbum ? (
          <Button variant="outline" className="rounded-full" onClick={() => setSelectedAlbum(null)}><ArrowLeft className="h-4 w-4" /> Voltar aos álbuns</Button>
        ) : (
          <Button className="rounded-full" onClick={() => setNewAlbumOpen(true)}><Plus className="h-4 w-4" /> Criar álbum</Button>
        )}
      </div>

      {newAlbumOpen ? (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Criar novo álbum</h2><Button variant="ghost" size="icon" onClick={() => setNewAlbumOpen(false)} aria-label="Fechar"><X className="h-4 w-4" /></Button></div>
          <Input value={albumTitle} onChange={(e) => setAlbumTitle(e.target.value)} maxLength={80} placeholder="Nome do álbum (ex.: Meus momentos)" />
          <div className="flex gap-2"><Button disabled={!albumTitle.trim() || createAlbum.isPending} onClick={() => createAlbum.mutate()}>{createAlbum.isPending ? "Criando..." : "Criar álbum"}</Button><Button variant="outline" onClick={() => setNewAlbumOpen(false)}>Cancelar</Button></div>
        </section>
      ) : null}

      {selectedAlbum ? (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
            <div><h2 className="font-display text-2xl font-semibold">{selectedAlbum.title}</h2><p className="text-sm text-muted-foreground">{photos.data?.length ?? 0} foto(s)</p></div>
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) addPhotos.mutate(e.target.files); e.target.value = ""; }} />
              <Button onClick={() => fileRef.current?.click()} disabled={addPhotos.isPending}><ImagePlus className="h-4 w-4" /> {addPhotos.isPending ? "Adicionando..." : "Adicionar fotos"}</Button>
              <Button variant="destructive" onClick={() => { if (window.confirm("Excluir este álbum e todas as fotos dele?")) deleteAlbum.mutate(selectedAlbum); }} disabled={deleteAlbum.isPending}><Trash2 className="h-4 w-4" /> Excluir álbum</Button>
            </div>
          </div>
          <div className="max-w-xl"><Textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={240} placeholder="Legenda para as próximas fotos (opcional)" className="min-h-16" /></div>
          {photos.isLoading ? <p className="py-10 text-center text-muted-foreground">Carregando fotos...</p> : photos.isError ? <p role="alert" className="text-destructive">Não foi possível carregar as fotos deste álbum.</p> : (photos.data ?? []).length === 0 ? <div className="rounded-2xl border border-dashed border-border p-10 text-center"><ImagePlus className="mx-auto mb-3 h-9 w-9 text-muted-foreground" /><p className="font-medium">Este álbum ainda está vazio</p><p className="mt-1 text-sm text-muted-foreground">Clique em “Adicionar fotos” para escolher imagens.</p></div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{photos.data!.map((photo) => <GalleryPhoto key={photo.id} photo={photo} onDelete={(p) => { if (window.confirm("Excluir esta foto?")) deletePhoto.mutate(p); }} />)}</div>}
        </section>
      ) : albums.isLoading ? <p className="py-12 text-center text-muted-foreground">Carregando seus álbuns...</p> : albums.isError ? <p role="alert" className="rounded-2xl border border-destructive/30 p-5 text-destructive">Não foi possível carregar a galeria. Atualize a página e tente novamente.</p> : (albums.data ?? []).length === 0 ? <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-14 text-center"><Images className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><h2 className="font-display text-xl font-semibold">Sua galeria está vazia</h2><p className="mt-2 text-sm text-muted-foreground">Crie seu primeiro álbum e adicione suas fotos favoritas.</p><Button className="mt-5 rounded-full" onClick={() => setNewAlbumOpen(true)}><Plus className="h-4 w-4" /> Criar primeiro álbum</Button></div> : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{albums.data!.map((album) => <button key={album.id} type="button" onClick={() => setSelectedAlbum(album)} className="overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><AlbumCover album={album} /><div className="p-3"><p className="truncate font-semibold">{album.title}</p><p className="text-xs text-muted-foreground">Abrir álbum</p></div></button>)}</div>}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/galeria")({
  head: () => ({ meta: [{ title: "Galeria — The Secret Bookshelf" }] }),
  component: GalleryPage,
});
