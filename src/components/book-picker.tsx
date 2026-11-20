import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BookCover } from "@/components/book-cover";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/media";
import { getMyId, useInvalidate, type Book } from "@/lib/social";

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
  onSelect: (book: Book) => void | Promise<void>;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const { data: books = [], isLoading } = useBookSearch(q);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setCreating(false);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-primary">
            {creating ? "Adicionar novo livro" : title}
          </DialogTitle>
        </DialogHeader>
        {creating ? (
          <NewBookForm
            initialTitle={q}
            onCancel={() => setCreating(false)}
            onCreated={async (book) => {
              await onSelect(book);
              setCreating(false);
              onOpenChange(false);
            }}
          />
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por título ou autor"
                className="pl-9"
              />
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {isLoading ? <p className="p-3 text-sm text-muted-foreground">Buscando…</p> : null}
              {books.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={async () => {
                    await onSelect(b);
                    onOpenChange(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent"
                >
                  <BookCover book={b} className="w-10" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{b.title}</p>
                    <p className="truncate text-sm text-muted-foreground">{b.author}</p>
                  </div>
                </button>
              ))}
              {!isLoading && books.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">Nenhum livro encontrado.</p>
              ) : null}
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
  onCreated: (book: Book) => Promise<void>;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState("");
  const [pages, setPages] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        try {
          const me = await getMyId();
          const coverPath = cover ? await uploadMedia(me, cover, "covers") : null;
          const { data, error } = await supabase
            .from("books")
            .insert({
              title: title.trim(),
              author: author.trim(),
              pages: pages ? Number(pages) : null,
              cover_url: coverPath,
              created_by: me,
            })
            .select("*")
            .single();
          if (error) throw error;
          await invalidate("books");
          toast.success("Livro adicionado!");
          await onCreated(data);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Não foi possível adicionar o livro.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="nb-title">Título</Label>
        <Input id="nb-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nb-author">Autor(a)</Label>
        <Input id="nb-author" maxLength={120} value={author} onChange={(e) => setAuthor(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nb-pages">Número de páginas</Label>
        <Input id="nb-pages" type="number" min={1} value={pages} onChange={(e) => setPages(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nb-cover">Capa (opcional)</Label>
        <Input id="nb-cover" type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Voltar
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Adicionar livro"}
        </Button>
      </div>
    </form>
  );
}
