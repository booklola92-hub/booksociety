/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any, no-control-regex, no-useless-escape -- validação defensiva de respostas JSON externas e sanitização CSV. */
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

async function findBookCover(title: string, author: string): Promise<string | null> {
  const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ").trim();
  const wantedTitle = normalize(title);
  const wantedAuthor = normalize(author);
  const titleMatches = (candidate: string) => {
    const normalized = normalize(candidate);
    return Boolean(normalized && wantedTitle) && (normalized === wantedTitle || normalized.includes(wantedTitle) || wantedTitle.includes(normalized));
  };
  const authorMatches = (authors: string[]) => {
    if (!wantedAuthor || !authors.length) return true;
    return authors.some((name) => {
      const candidate = normalize(name);
      return candidate === wantedAuthor || candidate.includes(wantedAuthor) || wantedAuthor.includes(candidate);
    });
  };

  // Internet Archive primeiro: consulta registros públicos e usa a miniatura oficial.
  try {
    const query = author
      ? `title:("${title.replace(/["\\\\]/g, " ")}") AND creator:("${author.replace(/["\\\\]/g, " ")}") AND mediatype:texts`
      : `title:("${title.replace(/["\\\\]/g, " ")}") AND mediatype:texts`;
    const response = await fetch("https://archive.org/advancedsearch.php?q=" + encodeURIComponent(query) +
      "&fl[]=identifier,title,creator&rows=20&page=1&output=json", { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const payload = await response.json();
      const docs = payload.response?.docs ?? [];
      const match = docs.find((doc: any) =>
        titleMatches(String(doc.title ?? "")) &&
        authorMatches(Array.isArray(doc.creator) ? doc.creator.map(String) : [String(doc.creator ?? "")]));
      if (match?.identifier) {
        const cover = "https://archive.org/services/img/" + encodeURIComponent(String(match.identifier));
        const image = new Image();
        const loaded = await new Promise<boolean>((resolve) => {
          image.onload = () => resolve(image.naturalWidth > 0);
          image.onerror = () => resolve(false);
          image.src = cover;
          setTimeout(() => resolve(false), 3000);
        });
        if (loaded) return cover;
      }
    }
  } catch { /* tenta a próxima fonte */ }

  // AniList para mangás, manhwas, novels e títulos BL.
  try {
    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: `query ($search: String) {
          Page(page: 1, perPage: 20) {
            media(search: $search, type: MANGA) {
              title { romaji english native }
              coverImage { extraLarge large }
              staff(perPage: 10) { edges { role node { name { full } } } }
            }
          }
        }`,
        variables: { search: title },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const payload = await response.json();
      const items = payload.data?.Page?.media ?? [];
      const match = items.find((item: any) =>
        [item.title?.romaji, item.title?.english, item.title?.native].some((name: string) => name && titleMatches(name)) &&
        authorMatches((item.staff?.edges ?? [])
          .filter((edge: any) => /story|art|original creator|author/i.test(String(edge.role ?? "")))
          .map((edge: any) => String(edge.node?.name?.full ?? ""))));
      const image = match?.coverImage?.extraLarge ?? match?.coverImage?.large;
      if (image) return String(image);
    }
  } catch { /* tenta Google Books */ }

  // Google Books para livros tradicionais.
  try {
    const terms = [title.trim(), author.trim()].filter(Boolean).join(" ");
    const params = new URLSearchParams({ q: terms, maxResults: "20", printType: "books" });
    const response = await fetch("https://www.googleapis.com/books/v1/volumes?" + params.toString(), {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const match = (payload.items ?? []).find((volume: { volumeInfo?: { title?: string; authors?: string[]; imageLinks?: { extraLarge?: string; large?: string; thumbnail?: string; smallThumbnail?: string } } }) => {
      const info = volume.volumeInfo ?? {};
      return titleMatches(info.title ?? "") && authorMatches(info.authors ?? []);
    });
    const imageLinks = match?.volumeInfo?.imageLinks;
    const image = imageLinks?.extraLarge ?? imageLinks?.large ?? imageLinks?.thumbnail ?? imageLinks?.smallThumbnail;
    return image ? String(image).replace("http://", "https://").replace("&edge=curl", "") : null;
  } catch {
    return null;
  }
}

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
  onSelect: (book: Book, details?: { status: "want" | "reading" | "read"; rating: number | null; review: string; started_at: string | null; finished_at: string | null }) => void | Promise<void>;
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
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-primary">
            {creating ? "Adicionar novo livro" : title}
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
  onCreated: (book: Book, details: { status: "want" | "reading" | "read"; rating: number | null; review: string; started_at: string | null; finished_at: string | null }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState("");
  const [pages, setPages] = useState("0");
  const [genre, setGenre] = useState("");
  const [status, setStatus] = useState<"want" | "reading" | "read">("want");
  const [rating, setRating] = useState("0");
  const [startedAt, setStartedAt] = useState("");
  const [finishedAt, setFinishedAt] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [review, setReview] = useState("");
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
          const coverPath = cover
            ? await uploadMedia(me, cover, "covers")
            : await findBookCover(title, author);
          const { data, error } = await supabase
            .from("books")
            .insert({
              title: title.trim(),
              author: author.trim(),
              pages: pages && Number(pages) > 0 ? Number(pages) : null,
              genre: genre.trim(),
              description: synopsis.trim(),
              cover_url: coverPath,
              created_by: me,
            })
            .select("*")
            .single();
          if (error) throw error;
          const details = {
            status,
            rating: Number(rating) > 0 ? Number(rating) : null,
            review: review.trim(),
            started_at: startedAt ? new Date(`${startedAt}T12:00:00`).toISOString() : null,
            finished_at: finishedAt ? new Date(`${finishedAt}T12:00:00`).toISOString() : null,
          };
          const { error: shelfError } = await supabase.from("shelf_items").upsert({
            user_id: me, book_id: data.id, status: details.status, rating: details.rating,
            review: details.review, started_at: details.started_at, finished_at: details.finished_at,
          }, { onConflict: "user_id,book_id" });
          if (shelfError) throw shelfError;
          await invalidate("books", "shelf");
          toast.success("Livro salvo na sua biblioteca!");
          await onCreated(data, details);
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
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="nb-genre">Gênero</Label>
          <Input id="nb-genre" maxLength={80} value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Ex.: Romance, fantasia" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nb-pages">Páginas</Label>
          <Input id="nb-pages" type="number" min={0} value={pages} onChange={(e) => setPages(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nb-status">Estante</Label>
          <select id="nb-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="want">Quero ler</option><option value="reading">Lendo</option><option value="read">Lido</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nb-rating">Minha nota</Label>
          <select id="nb-rating" value={rating} onChange={(e) => setRating(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="0">Sem nota</option>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nb-start">Data de início</Label>
          <Input id="nb-start" type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nb-finish">Data de conclusão</Label>
          <Input id="nb-finish" type="date" value={finishedAt} onChange={(e) => setFinishedAt(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nb-cover">Capa</Label>
        <Input id="nb-cover" type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nb-synopsis">Sinopse</Label>
        <textarea id="nb-synopsis" rows={4} maxLength={3000} value={synopsis} onChange={(e) => setSynopsis(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nb-review">Minha resenha</Label>
        <textarea id="nb-review" rows={4} maxLength={3000} value={review} onChange={(e) => setReview(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
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
