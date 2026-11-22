import { useEffect, useState } from "react";
import { BookOpen, ExternalLink, Loader2 } from "lucide-react";

import type { CatalogCategory } from "@/lib/catalog-search";

type ExternalBook = {
  id: string;
  title: string;
  authors: string[];
  description: string;
  cover: string | null;
  url: string;
  source: string;
};

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function categoryTerm(category: CatalogCategory): string {
  switch (category) {
    case "livros": return "book";
    case "novels": return "novel light novel web novel";
    case "mangas": return "manga";
    case "manhwas": return "manhwa";
    case "bl": return "BL boys love";
    default: return "book novel light novel manga manhwa";
  }
}

async function searchExternalBooks(query: string, category: CatalogCategory, signal: AbortSignal) {
  const term = categoryTerm(category);
  const encoded = encodeURIComponent(query);
  const googleQuery = encodeURIComponent(`${query} ${term}`);
  const [googleResponse, openResponse] = await Promise.allSettled([
    fetch(`https://www.googleapis.com/books/v1/volumes?q=${googleQuery}&maxResults=10&printType=books`, { signal }),
    fetch(`https://openlibrary.org/search.json?q=${encoded}&limit=10`, { signal }),
  ]);

  const books: ExternalBook[] = [];

  if (googleResponse.status === "fulfilled" && googleResponse.value.ok) {
    const data = await googleResponse.value.json();
    for (const item of data.items ?? []) {
      const info = item.volumeInfo ?? {};
      if (!info.title) continue;
      books.push({
        id: `google-${item.id}`,
        title: cleanText(info.title),
        authors: info.authors ?? [],
        description: cleanText(info.description),
        cover: info.imageLinks?.thumbnail?.replace("http://", "https://") ?? null,
        url: info.infoLink ?? `https://books.google.com/books?id=${item.id}`,
        source: "Google Books",
      });
    }
  }

  if (openResponse.status === "fulfilled" && openResponse.value.ok) {
    const data = await openResponse.value.json();
    for (const item of data.docs ?? []) {
      if (!item.title) continue;
      const key = item.key ?? "";
      books.push({
        id: `open-${key || item.title}`,
        title: cleanText(item.title),
        authors: item.author_name ?? [],
        description: item.first_sentence?.[0] ? cleanText(item.first_sentence[0]) : "",
        cover: item.cover_i ? `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg` : null,
        url: key ? `https://openlibrary.org${key}` : "https://openlibrary.org",
        source: "Open Library",
      });
    }
  }

  const seen = new Set<string>();
  return books.filter((book) => {
    const key = book.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

export function ExternalBookResults({ query, category }: { query: string; category: CatalogCategory }) {
  const [books, setBooks] = useState<ExternalBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    searchExternalBooks(query, category, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setBooks(items);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, category]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl font-semibold">Livros da internet</h2>
        <span className="text-xs text-muted-foreground">Google Books + Open Library</span>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Procurando livros...
        </div>
      ) : failed && books.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Não foi possível consultar os catálogos externos agora. Tente novamente.
        </p>
      ) : books.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhum livro encontrado nesses catálogos. Confira também os resultados da pesquisa na Web.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {books.map((book) => (
            <article key={book.id} className="flex gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
              {book.cover ? (
                <img src={book.cover} alt={`Capa de ${book.title}`} loading="lazy" className="h-32 w-20 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="flex h-32 w-20 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                  <BookOpen className="h-7 w-7" />
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <h3 className="line-clamp-2 font-display font-semibold">{book.title}</h3>
                <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                  {book.authors.length ? book.authors.join(", ") : "Autor(a) não informado(a)"}
                </p>
                {book.description && <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{book.description}</p>}
                <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                  <span className="text-xs text-muted-foreground">{book.source}</span>
                  <a href={book.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    Ver obra <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
