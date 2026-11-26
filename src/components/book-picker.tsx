import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BookCover } from "@/components/book-cover";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/media";
import { getMyId, useInvalidate, type Book, type ShelfStatus } from "@/lib/social";

type NewShelfDetails = {
  status: ShelfStatus;
  rating: number | null;
  started_at: string | null;
  finished_at: string | null;
  review: string;
};

export function useBookSearch(q: string, limit = 20) {
  const clean = q.replace(/[%,()*]/g, " ").trim();
  return useQuery({
    queryKey: ["books", "search", clean, limit],
    queryFn: async () => {
      let query = supabase.from("books").select("*").order("title").limit(limit);
      if (clean) query = query.or(`title.ilike.%${clean}%,author.ilike.%${clean}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function BookPicker({
  open,
  onOpenChange,
  onSelect,
  title = "Escolher livro",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (book: Book, details?: NewShelfDetails) => void | Promise<void>;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const { data: books = [], isLoading } = useBookSearch(q);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setCreating(false); }}>
      <DialogContent className={creating ? "max-h-[94vh] max-w-2xl overflow-y-auto rounded-2xl border-[#ead8d0] bg-[#fbf6f2] p-5" : "max-w-lg"}>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-[#563d3d]">
            {creating ? "Adicionar livro" : title}
          </DialogTitle>
        </DialogHeader>
        {creating ? (
          <NewBookForm
            initialTitle={q}
            onCancel={() => setCreating(false)}
            onCreated={async (book, details) => {
              await onSelect(book, details);
              setCreating(false);
              onOpenChange(false);
            }}
          />
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título ou autor" className="pl-9" />
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {isLoading ? <p className="p-3 text-sm text-muted-foreground">Buscando…</p> : null}
              {books.map((b) => (
                <button key={b.id} type="button" onClick={async () => { await onSelect(b); onOpenChange(false); }}
                  className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent">
                  <BookCover book={b} className="w-10" />
                  <div className="min-w-0"><p className="truncate font-medium">{b.title}</p><p className="truncate text-sm text-muted-foreground">{b.author}</p></div>
                </button>
              ))}
              {!isLoading && books.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Nenhum livro encontrado.</p> : null}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Não achou? Adicionar novo livro
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewBookForm({
  initialTitle,
  onCancel,
  onCreated,
}: {
  initialTitle: string;
  onCancel: () => void;
  onCreated: (book: Book, details: NewShelfDetails) => Promise<void>;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState("");
  const [genre, setGenre] = useState("");
  const [pages, setPages] = useState("");
  const [status, setStatus] = useState<ShelfStatus>("want");
  const [rating, setRating] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [finishedAt, setFinishedAt] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [synopsis, setSynopsis] = useState("");
  const [review, setReview] = useState("");
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();

  const fieldClass = "h-12 rounded-xl border-[#ead8d0] bg-white/80 text-[#5b4b4b] focus-visible:ring-[#8c2639]";
  const selectClass = "h-12 w-full rounded-xl border border-[#ead8d0] bg-white/80 px-4 text-sm text-[#5b4b4b] outline-none focus:ring-2 focus:ring-[#8c2639]";
  const labelClass = "text-sm font-normal text-[#3f3838]";

  return (
    <form className="space-y-5" onSubmit={async (e) => {
      e.preventDefault();
      if (!title.trim()) return;
      setBusy(true);
      try {
        const me = await getMyId();
        const coverPath = cover ? await uploadMedia(me, cover, "covers") : null;
        const { data, error } = await supabase.from("books").insert({
          title: title.trim(), author: author.trim(), genre: genre.trim(),
          pages: pages ? Number(pages) : null, description: synopsis.trim(),
          cover_url: coverPath, created_by: me,
        }).select("*").single();
        if (error) throw error;
        const details: NewShelfDetails = {
          status, rating: rating ? Number(rating) : null,
          started_at: startedAt || null, finished_at: finishedAt || null, review: review.trim(),
        };
        await invalidate("books");
        toast.success("Livro adicionado!");
        await onCreated(data, details);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Não foi possível adicionar o livro.");
      } finally {
        setBusy(false);
      }
    }}>
      <div className="space-y-2">
        <Label htmlFor="nb-title" className={labelClass}>Título</Label>
        <Input id="nb-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nb-author" className={labelClass}>Autor</Label>
        <Input id="nb-author" maxLength={120} value={author} onChange={(e) => setAuthor(e.target.value)} className={fieldClass} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label htmlFor="nb-genre" className={labelClass}>Gênero</Label><Input id="nb-genre" value={genre} onChange={(e) => setGenre(e.target.value)} className={fieldClass} /></div>
        <div className="space-y-2"><Label htmlFor="nb-pages" className={labelClass}>Páginas</Label><Input id="nb-pages" type="number" min={1} value={pages} onChange={(e) => setPages(e.target.value)} placeholder="0" className={fieldClass} /></div>
        <div className="space-y-2"><Label htmlFor="nb-status" className={labelClass}>Estante</Label>
          <select id="nb-status" value={status} onChange={(e) => setStatus(e.target.value as ShelfStatus)} className={selectClass}>
            <option value="want">Quero ler</option><option value="reading">Lendo</option><option value="read">Lido</option><option value="not_finished">Abandonado</option>
          </select>
        </div>
        <div className="space-y-2"><Label htmlFor="nb-rating" className={labelClass}>Minha nota</Label>
          <select id="nb-rating" value={rating} onChange={(e) => setRating(e.target.value)} className={selectClass}>
            <option value="">Sem nota</option><option value="1">1 estrela</option><option value="2">2 estrelas</option><option value="3">3 estrelas</option><option value="4">4 estrelas</option><option value="5">5 estrelas</option>
          </select>
        </div>
        <div className="space-y-2"><Label htmlFor="nb-start" className={labelClass}>Início</Label><Input id="nb-start" type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} className={fieldClass} /></div>
        <div className="space-y-2"><Label htmlFor="nb-finish" className={labelClass}>Conclusão</Label><Input id="nb-finish" type="date" value={finishedAt} onChange={(e) => setFinishedAt(e.target.value)} className={fieldClass} /></div>
      </div>
      <div className="space-y-2"><Label htmlFor="nb-cover" className={labelClass}>Capa</Label><Input id="nb-cover" type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} className={fieldClass} /></div>
      <div className="space-y-2"><Label htmlFor="nb-synopsis" className={labelClass}>Sinopse</Label><Textarea id="nb-synopsis" value={synopsis} onChange={(e) => setSynopsis(e.target.value)} className="min-h-24 rounded-xl border-[#ead8d0] bg-white/80" /></div>
      <div className="space-y-2"><Label htmlFor="nb-review" className={labelClass}>Minha resenha</Label><Textarea id="nb-review" value={review} onChange={(e) => setReview(e.target.value)} className="min-h-24 rounded-xl border-[#ead8d0] bg-white/80" /></div>
      <Button type="submit" disabled={busy} className="h-12 w-full rounded-lg bg-[#92263a] text-base font-semibold text-white hover:bg-[#7f2032]">
        {busy ? "Salvando..." : "Salvar livro"}
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel} className="w-full text-[#765c5c]">Cancelar</Button>
    </form>
  );
}
