/* eslint-disable prettier/prettier */
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { BookCover } from "@/components/book-cover";
import { PageTitle } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  CATALOG_CATEGORIES,
  CATALOG_PAGE_SIZE,
  catalogKindLabel,
  cleanCatalogQuery,
  type CatalogCategory,
  type CatalogItem,
} from "@/lib/catalog-search";
import { addToShelf, type ShelfStatus } from "@/lib/social";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_shell/buscar-obras")({
  head: () => ({
    meta: [
      { title: "Buscar obras — Book Society" },
      { name: "description", content: "Pesquise livros, novels, mangás, manhwas e BL no catálogo do Book Society." },
      { property: "og:title", content: "Buscar obras — Book Society" },
      { property: "og:description", content: "Encontre leituras no catálogo interno do Book Society." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuscarObras,
});

async function searchInternalCatalog(q: string, category: CatalogCategory, limit: number, offset: number) {
  const { data, error } = await supabase.rpc("search_catalog", {
    _q: q,
    _qn: "",
    _category: category,
    _limit: limit,
    _offset: offset,
  });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const item = row as CatalogItem & { genre?: string | null; genres?: string[] };
    const genres = Array.isArray(item.genres)
      ? item.genres
      : String(item.genre ?? "").split(/[,;|]/).map((value) => value.trim()).filter(Boolean);
    return { ...item, genres };
  });
}

async function searchExternalCatalog(q: string, category: CatalogCategory): Promise<CatalogItem[]> {
  if (!q.trim()) return [];
  const results: CatalogItem[] = [];
  if (["todos", "livros"].includes(category)) {
    try {
      const { data, error } = await supabase.functions.invoke("piloterr-goodreads-search", { body: { query: q, page: 1 } });
      if (error) throw error;
      for (const book of data?.results ?? []) {
        if (!book.title) continue;
        results.push({
          id: "piloterr-" + String(book.id ?? book.title), origin: "external", title: book.title,
          authors: Array.isArray(book.authors) ? book.authors : [],
          cover_url: book.image ?? null, synopsis: null, kind: "livro", is_bl: false,
          alt_titles: book.series ? [book.series] : [], genres: [], language: null,
        });
      }
    } catch (error) { console.warn("Piloterr indisponível:", error); }
    try {
      const params = new URLSearchParams({ q, maxResults: "20", printType: "books" });
      const response = await fetch("https://www.googleapis.com/books/v1/volumes?" + params.toString());
      if (response.ok) {
        const payload = await response.json();
        for (const volume of payload.items ?? []) {
          const info = volume.volumeInfo ?? {};
          if (!info.title) continue;
          results.push({
            id: "google-" + volume.id, origin: "external", title: info.title,
            authors: Array.isArray(info.authors) ? info.authors : [],
            cover_url: info.imageLinks?.thumbnail?.replace("http://", "https://") ?? null,
            synopsis: info.description ?? null, kind: "livro", is_bl: false, alt_titles: [], genres: Array.isArray(info.categories) ? info.categories : [],
            language: ({ pt: "Português", en: "Inglês", es: "Espanhol", ko: "Coreano" } as Record<string, string>)[info.language] ?? info.language ?? null,
          });
        }
      }
    } catch (error) { console.warn("Google Books indisponível:", error); }
  }
  if (["todos", "novels", "mangas", "manhwas", "bl"].includes(category)) {
    try {
      const query = "query ($search: String) { Page(page: 1, perPage: 25) { media(search: $search, type: MANGA, sort: SEARCH_MATCH) { id format countryOfOrigin description title { romaji english native } synonyms coverImage { large medium } staff { edges { role node { name { full } } } } genres tags { name } } } }";
      const response = await fetch("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ query, variables: { search: q } }) });
      if (response.ok) {
        const payload = await response.json();
        for (const media of payload.data?.Page?.media ?? []) {
          const country = String(media.countryOfOrigin ?? "");
          const kind = media.format === "NOVEL" ? "novel" : country === "KR" ? "manhwa" : country === "CN" ? "manhua" : "manga";
          const names = [...(media.genres ?? []), ...(media.tags ?? []).map((tag: { name: string }) => tag.name)];
          const isBl = names.some((name: string) => /boys.? love|yaoi|bl\b/i.test(name));
          if (category === "novels" && kind !== "novel") continue;
          if (category === "mangas" && kind !== "manga") continue;
          if (category === "manhwas" && kind !== "manhwa") continue;
          if (category === "bl" && !isBl) continue;
          const title = media.title?.english || media.title?.romaji || media.title?.native;
          if (!title) continue;
          results.push({
            id: "anilist-" + media.id, origin: "external", title,
            authors: (media.staff?.edges ?? []).filter((edge: { role: string }) => /story|art/i.test(edge.role)).slice(0, 3).map((edge: { node: { name: { full: string } } }) => edge.node.name.full),
            cover_url: media.coverImage?.large ?? media.coverImage?.medium ?? null,
            synopsis: media.description?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 1000) ?? null,
            kind, is_bl: isBl, alt_titles: (media.synonyms ?? []).slice(0, 5), genres: names,
            language: country === "KR" ? "Coreano" : country === "JP" ? "Japonês" : country === "CN" ? "Chinês" : null,
          });
        }
      }
    } catch (error) { console.warn("AniList indisponível:", error); }
  }
  return results;
}

async function searchCatalog(q: string, category: CatalogCategory, limit: number, offset: number) {
  const [internal, external] = await Promise.all([
    searchInternalCatalog(q, category, offset === 0 ? Math.min(limit, 12) : limit, offset),
    offset === 0 ? searchExternalCatalog(q, category) : Promise.resolve([]),
  ]);
  const seen = new Set(internal.map((item) => item.title.toLowerCase()));
  const unique = external.filter((item) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...internal, ...unique].slice(offset, offset + limit);
}

function BuscarObras() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [category, setCategory] = useState<CatalogCategory>("todos");
  const [includeGenres, setIncludeGenres] = useState("");
  const [excludeGenres, setExcludeGenres] = useState("");

  const results = useInfiniteQuery({
    queryKey: ["catalog-search", searched, category],
    initialPageParam: 0,
    enabled: Boolean(searched),
    staleTime: 60 * 1000,
    queryFn: ({ pageParam }) => searchCatalog(searched, category, CATALOG_PAGE_SIZE, pageParam),
    getNextPageParam: (last, pages) =>
      last.length === CATALOG_PAGE_SIZE ? pages.length * CATALOG_PAGE_SIZE : undefined,
  });

  // Dedupe by origin+id so a BL work that fits several categories appears once.
  const seen = new Set<string>();
  const items = (results.data?.pages.flat() ?? []).filter((item) => {
    const key = `${item.origin}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const parseGenres = (value: string) => value.split(/[,;\n]/).map((genre) => genre.trim().toLocaleLowerCase("pt-BR")).filter(Boolean);
  const included = parseGenres(includeGenres);
  const excluded = parseGenres(excludeGenres);
  const filteredItems = items.filter((item) => {
    const genres = (item.genres ?? []).map((genre) => genre.toLocaleLowerCase("pt-BR"));
    const hasIncluded = included.length === 0 || included.some((wanted) => genres.some((genre) => genre.includes(wanted)));
    const hasExcluded = excluded.some((blocked) => genres.some((genre) => genre.includes(blocked)));
    return hasIncluded && !hasExcluded;
  });
  const noMatches = Boolean(searched) && results.isSuccess && filteredItems.length === 0;
  // When nothing matches, check whether the category itself has any record yet.
  const categoryProbe = useQuery({
    queryKey: ["catalog-search", "category-has-items", category],
    enabled: noMatches,
    staleTime: 60 * 1000,
    queryFn: async () => (await searchCatalog("", category, 1, 0)).length > 0,
  });

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearched(cleanCatalogQuery(query));
  };

  const categoryLabel = CATALOG_CATEGORIES.find((item) => item.value === category)?.label;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Buscar obras"
        subtitle="Pesquise no catálogo do Book Society: livros, novels, light novels, mangás, manhwas e BL."
      />

      <form onSubmit={submitSearch} className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={200}
              placeholder="Digite o título ou nome do autor..."
              aria-label="Buscar obras por título ou autor"
              className="h-11 rounded-full pl-11"
            />
          </div>
          <Button type="submit" className="h-11 rounded-full px-6">
            <Search className="h-4 w-4" /> Buscar
          </Button>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Categorias">
          {CATALOG_CATEGORIES.map((item) => {
            const selected = category === item.value;
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setCategory(item.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium">Incluir gêneros
            <Input value={includeGenres} onChange={(event) => setIncludeGenres(event.target.value)} placeholder="Ex.: Romance, Fantasia" aria-label="Gêneros para incluir" />
            <span className="block text-xs font-normal text-muted-foreground">Separe os gêneros por vírgula. Mostra obras com pelo menos um deles.</span>
          </label>
          <label className="space-y-1.5 text-sm font-medium">Excluir gêneros
            <Input value={excludeGenres} onChange={(event) => setExcludeGenres(event.target.value)} placeholder="Ex.: Terror, Tragédia" aria-label="Gêneros para excluir" />
            <span className="block text-xs font-normal text-muted-foreground">Obras com qualquer um desses gêneros serão ocultadas.</span>
          </label>
        </div>
      </form>

      {searched && (
        <section className="space-y-4" aria-live="polite">
          <div className="space-y-1">
            <h2 className="font-display text-xl font-semibold">Resultados do catálogo</h2>
            <p className="text-sm text-muted-foreground">
              Pesquisa por <strong className="text-foreground">{searched}</strong>
              {" · "}
              {categoryLabel}
            </p>
          </div>

          {results.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Carregando resultados">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="flex gap-4 rounded-2xl border border-border bg-card p-4">
                  <Skeleton className="h-36 w-24 shrink-0 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.isError ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
              Não foi possível consultar o catálogo agora. Tente novamente.
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
              <p className="font-medium text-foreground">Nenhum livro encontrado. Tente outra pesquisa.</p>
              {categoryProbe.data === false && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Não encontramos resultados nessa categoria agora. Tente outro título ou autor.
                </p>
              )}
              {categoryProbe.data === true && (
                <p className="mt-2 text-sm text-muted-foreground">
                  A busca também consulta catálogos de livros e mangás automaticamente. Tente variar os termos da pesquisa.
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((item) => (
                <CatalogCard key={`${item.origin}-${item.id}`} item={item} onAdded={() => queryClient.invalidateQueries({ queryKey: ["shelf"] })} />
              ))}
            </div>
          )}

          {results.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                className="rounded-full px-6"
                disabled={results.isFetchingNextPage}
                onClick={() => void results.fetchNextPage()}
              >
                {results.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
                Mais resultados
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

const CATALOG_SHELF_STATUSES: { value: ShelfStatus; label: string }[] = [
  { value: "want", label: "Quero ler" },
  { value: "reading", label: "Atualmente lendo" },
  { value: "read", label: "Lido" },
  { value: "not_finished", label: "Não terminou" },
];

async function ensureBookId(item: CatalogItem): Promise<string> {
  if (item.origin === "book") return item.id;
  const author = item.authors.join(", ") || "Autor(a) não informado(a)";
  const { data: existing, error: lookupError } = await supabase
    .from("books").select("id").ilike("title", item.title).limit(1).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.id) return existing.id;
  const { data, error } = await supabase.from("books").insert({
    title: item.title,
    author,
    description: item.synopsis ?? "",
    cover_url: item.cover_url,
    created_by: (await supabase.auth.getUser()).data.user?.id,
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

function CatalogCard({ item, onAdded }: { item: CatalogItem; onAdded: () => void }) {
  const [status, setStatus] = useState<ShelfStatus>("want");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);

  async function addCatalogItem() {
    setBusy(true);
    try {
      const bookId = await ensureBookId(item);
      await addToShelf(bookId, status);
      setAdded(true);
      onAdded();
      toast.success(`“${item.title}” foi adicionado à Biblioteca.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar à Biblioteca.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <BookCover book={{ title: item.title, cover_url: item.cover_url }} className="w-24" />
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="font-display line-clamp-2 text-lg leading-snug font-semibold text-foreground">{item.title}</h2>
        <p className={cn("mt-0.5 line-clamp-1 text-sm", item.authors.length ? "text-foreground/80" : "text-muted-foreground italic")}>
          {item.authors.length ? item.authors.join(", ") : "Autor(a) não informado(a)"}
        </p>
        {item.alt_titles.length > 0 && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">Também conhecido como: {item.alt_titles.join(", ")}</p>}
        {item.synopsis && <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{item.synopsis}</p>}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">{catalogKindLabel(item.kind)}</span>
          {item.is_bl && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">BL</span>}
          {"language" in item && item.language && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">{item.language}</span>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select aria-label={`Status de ${item.title}`} value={status} onChange={(event) => setStatus(event.target.value as ShelfStatus)} disabled={busy || added}
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-2 text-xs">
            {CATALOG_SHELF_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <Button type="button" size="sm" className="shrink-0" disabled={busy || added} onClick={() => void addCatalogItem()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {busy ? "Adicionando…" : added ? "Adicionado" : "Adicionar"}
          </Button>
        </div>
      </div>
    </article>
  );
}
