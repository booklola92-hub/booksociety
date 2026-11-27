import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

type BookInfo = { id?: string; title: string; author?: string | null; cover_url: string | null; description?: string | null; genre?: string | null; pages?: number | null };

export function BookCover({ book, className, interactive = true }: { book: BookInfo; className?: string; interactive?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<BookInfo>(book);
  const [loading, setLoading] = useState(false);
  const storedCover = book.cover_url?.trim() || null;
  const fallbackCover = `https://covers.openlibrary.org/b/title/${encodeURIComponent(book.title)}-M.jpg?default=false`;
  const [usingFallback, setUsingFallback] = useState(!storedCover);
  useEffect(() => {
    setFailed(false);
    setUsingFallback(!storedCover);
  }, [storedCover, book.title]);
  const normalizedCover = storedCover?.startsWith("//") ? `https:${storedCover}` : storedCover?.startsWith("http://") ? storedCover.replace(/^http:\/\//i, "https://") : storedCover;
  const url = useMediaUrl(usingFallback ? fallbackCover : normalizedCover);
  const image = !url || failed
    ? <div className={cn("flex aspect-[2/3] shrink-0 items-center justify-center overflow-hidden rounded-md border border-primary/20 bg-primary p-1.5 text-center shadow-sm", className)}><span className="font-display text-xs leading-tight font-semibold text-primary-foreground">{book.title}</span></div>
    : <img src={url} alt={`Capa de ${book.title}`} loading="lazy" onError={() => {
        if (!usingFallback) {
          setUsingFallback(true);
          setFailed(false);
        } else {
          setFailed(true);
        }
      }} className={cn("aspect-[2/3] shrink-0 rounded-md object-cover shadow-sm", className)} />;

  async function showDetails() {
    setDetails(book);
    setOpen(true);
    if (!book.id) return;
    setLoading(true);
    const { data, error } = await supabase.from("books").select("id,title,author,cover_url,description,genre,pages").eq("id", book.id).maybeSingle();
    if (!error && data) setDetails(data as BookInfo);
    setLoading(false);
  }

  return <>
    {interactive ? <button type="button" onClick={() => void showDetails()} aria-label={`Ver detalhes de ${book.title}`} className={cn("block shrink-0 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>{image}</button> : image}
    {interactive ? <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-2xl text-primary">{details.title}</DialogTitle></DialogHeader>
        <div className="grid gap-5 sm:grid-cols-[minmax(130px,190px)_1fr]">
          <div className="mx-auto w-36 sm:w-full"><BookCoverPreview book={details} /></div>
          <div className="min-w-0 space-y-3">
            <p className="text-sm text-muted-foreground">{details.author || "Autor(a) não informado(a)"}</p>
            {details.genre ? <p className="text-sm"><strong>Gênero:</strong> {details.genre}</p> : null}
            {details.pages ? <p className="text-sm"><strong>Páginas:</strong> {details.pages}</p> : null}
            <div><h3 className="mb-1 flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4" /> Sinopse</h3>
              {loading ? <p className="text-sm text-muted-foreground">Carregando sinopse…</p> : <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{details.description?.trim() || "A sinopse ainda não foi cadastrada para este livro."}</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog> : null}
  </>;
}

function BookCoverPreview({ book }: { book: BookInfo }) {
  const normalized = book.cover_url?.startsWith("http://") ? book.cover_url.replace(/^http:\/\//i, "https://") : book.cover_url;
  const url = useMediaUrl(normalized || null);
  return url ? <img src={url} alt={`Capa de ${book.title}`} className="aspect-[2/3] w-full rounded-lg object-cover shadow-md" /> : <div className="flex aspect-[2/3] w-full items-center justify-center rounded-lg bg-primary p-3 text-center text-primary-foreground">{book.title}</div>;
}
