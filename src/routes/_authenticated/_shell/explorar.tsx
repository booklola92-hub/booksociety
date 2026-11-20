import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { BookOpen, Search, Sparkles } from "lucide-react";
import { PageTitle } from "@/components/empty-state";

type SearchField = "all" | "title" | "author";
type BookItem = { id: string; title: string; authors: string[]; cover: string | null };
type GoogleBooksResponse = { items?: Array<{ id: string; volumeInfo?: { title?: string; authors?: string[]; imageLinks?: { thumbnail?: string; smallThumbnail?: string } } }> };

const plannedSources = ["Goodreads", "Novel Updates", "NovelList", "KakaoPage", "Visorikigai", "LeituraManga", "EternalMangas", "LunarX", "RisingShadow", "Internet (somente fontes permitidas)"];

function ExplorePage() {
  const [query, setQuery] = useState("");
  const [field, setField] = useState<SearchField>("all");
  const [results, setResults] = useState<BookItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (!term || loading) return;
    setLoading(true);
    setError("");
    setSearched(true);
    setResults([]);
    const searchTerm = field === "title" ? `intitle:${term}` : field === "author" ? `inauthor:${term}` : term;
    try {
      const params = new URLSearchParams({ q: searchTerm, maxResults: "24", printType: "books", orderBy: "relevance" });
      const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`);
      if (!response.ok) throw new Error("Não foi possível consultar o Google Books agora.");
      const data = (await response.json()) as GoogleBooksResponse;
      setResults((data.items ?? []).flatMap((item) => {
        const info = item.volumeInfo;
        if (!info?.title) return [];
        const rawCover = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;
        return [{ id: item.id, title: info.title, authors: info.authors ?? [], cover: rawCover ? rawCover.replace(/^http:\/\//, "https://").replace("&edge=curl", "") : null }];
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ocorreu um erro inesperado na busca.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-7">
      <PageTitle title="Explorar" subtitle="Descubra livros, novels, mangás e webtoons em um só lugar." />
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="mb-4 flex items-center gap-2 text-primary">
          <Sparkles className="h-5 w-5" />
          <h2 className="font-display text-2xl font-semibold">Encontre sua próxima leitura</h2>
        </div>
        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="explore-query">Buscar por título, autor ou palavra-chave</label>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input id="explore-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Digite um título, autor ou palavra-chave..." maxLength={120} className="h-12 w-full rounded-xl border border-input bg-background pl-12 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>
          <select aria-label="Tipo de busca" value={field} onChange={(event) => setField(event.target.value as SearchField)} className="h-12 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary">
            <option value="all">Tudo</option><option value="title">Título</option><option value="author">Autor</option>
          </select>
          <button type="submit" disabled={!query.trim() || loading} className="h-12 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{loading ? "Buscando..." : "Buscar"}</button>
        </form>
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fontes da busca</p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Google Books · conectado</span>
            {plannedSources.map((source) => <span key={source} title="Integração ainda não disponível" className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">{source} · em integração</span>)}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">No momento, os resultados reais vêm do Google Books. As demais fontes aparecem como em integração até existir uma conexão compatível; nenhum resultado ou capa é inventado.</p>
        </div>
      </section>
      {error ? <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
      {loading ? <div className="flex items-center justify-center gap-3 rounded-2xl border border-border bg-card px-5 py-12 text-sm text-muted-foreground"><span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />Procurando leituras...</div> : null}
      {!loading && searched && !error && results.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center"><BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-display text-xl font-semibold text-foreground">Nenhum resultado encontrado</p><p className="mt-2 text-sm text-muted-foreground">Tente outro termo ou faça uma busca mais ampla.</p></div> : null}
      {!loading && results.length > 0 ? (
        <section aria-live="polite">
          <div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="font-display text-2xl font-semibold text-primary">Resultados</h2><p className="text-sm text-muted-foreground">{results.length} {results.length === 1 ? "obra encontrada" : "obras encontradas"}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Google Books</span></div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {results.map((book) => <article key={book.id} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex aspect-[2/3] items-center justify-center overflow-hidden bg-muted">
                {book.cover ? <img src={book.cover} alt={`Capa de ${book.title}`} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <div className="flex flex-col items-center gap-2 px-3 text-center text-muted-foreground"><BookOpen className="h-9 w-9" /><span className="text-xs">Capa indisponível</span></div>}
              </div>
              <div className="space-y-2 p-3"><h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground" title={book.title}>{book.title}</h3><p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">{book.authors.length ? book.authors.join(", ") : "Autor não informado"}</p><span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-secondary-foreground">Google Books</span></div>
            </article>)}
          </div>
        </section>
      ) : null}
      {!searched ? <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center"><BookOpen className="mx-auto mb-3 h-9 w-9 text-primary/60" /><p className="font-display text-xl font-semibold text-foreground">Sua próxima história começa aqui</p><p className="mt-2 text-sm text-muted-foreground">Pesquise pelo nome da obra, pelo autor ou por uma palavra-chave.</p></div> : null}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/explorar")({
  validateSearch: (s: Record<string, unknown>): { q?: string } => (typeof s["q"] === "string" ? { q: s["q"] } : {}),
  head: () => ({ meta: [{ title: "Explorar — Book Society" }] }),
  component: ExplorePage,
});
