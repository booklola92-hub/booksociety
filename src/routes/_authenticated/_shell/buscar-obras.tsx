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

async function searchExternalCatalog(q: string, category: CatalogCategory, limit: number, offset: number): Promise<CatalogItem[]> {
  if (!q.trim()) return [];
  const results: CatalogItem[] = [];
  if (["todos", "livros", "novels"].includes(category)) {
    // Livros: português/inglês. Novels: inglês/coreano/espanhol.
    const languageSearches = category === "novels"
      ? [{ code: "en", label: "Inglês" }, { code: "ko", label: "Coreano" }, { code: "es", label: "Espanhol" }]
      : [{ code: "pt", label: "Português" }, { code: "en", label: "Inglês" }];
    const googleSearches = await Promise.all(languageSearches.map(async ({ code, label }) => {
      try {
        const chunks = await Promise.all(Array.from({ length: 13 }, async (_, chunk) => {
          const params = new URLSearchParams({
            q,
            maxResults: "40",
            startIndex: String(Math.max(offset, 0) + chunk * 40),
            printType: "books",
            orderBy: "relevance",
            projection: "full",
            langRestrict: code,
          });
          const response = await fetch("https://www.googleapis.com/books/v1/volumes?" + params.toString());
          if (!response.ok) return [];
          const payload = await response.json();
          return (payload.items ?? []).flatMap((volume: any) => {
            const info = volume.volumeInfo ?? {};
            if (!info.title) return [];
            return [{
              id: "google-" + volume.id,
              origin: "external" as const,
              title: info.title,
              authors: Array.isArray(info.authors) ? info.authors : [],
              cover_url: info.imageLinks?.thumbnail?.replace("http://", "https://") ?? null,
              synopsis: info.description ?? null,
              kind: category === "novels" ? "novel" : "livro",
              is_bl: false,
              alt_titles: [],
              genres: Array.isArray(info.categories) ? info.categories : [],
              rating: typeof info.averageRating === "number" ? info.averageRating : null,
              ratings_count: typeof info.ratingsCount === "number" ? info.ratingsCount : null,
              language: label,
              publisher: info.publisher ?? null,
              isbn: (info.industryIdentifiers ?? []).find((entry: any) => entry.type === "ISBN_13")?.identifier
                ?? (info.industryIdentifiers ?? []).find((entry: any) => entry.type === "ISBN_10")?.identifier
                ?? null,
              published_date: info.publishedDate ?? null,
              source_url: info.infoLink ?? null,
            }];
          });
        }));
        return chunks.flat();
      } catch (error) {
        console.warn("Google Books (" + code + ") indisponível:", error);
        return [];
      }
    }));
    results.push(...googleSearches.flat());

    // Skoob: fonte complementar para edições brasileiras, com autenticação mantida no servidor.
    if (category !== "novels") {
      try {
        const { data, error } = await supabase.functions.invoke("skoob-catalog", {
          body: { query: q, limit: 100 },
        });
        if (error) throw error;
        for (const [index, book] of (data?.results ?? []).entries()) {
          const title = String(book.title ?? book.titulo ?? "").trim();
          if (!title) continue;
          const author = String(book.author ?? book.autor ?? "").trim();
          const isbn = String(book.isbn_13 ?? book.isbn13 ?? book.isbn_10 ?? book.isbn ?? "").trim();
          const skoobUrl = String(book.skoob_url ?? book.url ?? "").trim();
          results.push({
            id: "skoob-" + String(book.id ?? book.book_id ?? index),
            origin: "external",
            title,
            authors: author ? [author] : [],
            cover_url: String(book.cover ?? book.capa_grande ?? book.capa_media ?? "").trim() || null,
            synopsis: String(book.synopsis ?? book.sinopse ?? "").trim() || null,
            kind: "livro",
            is_bl: false,
            alt_titles: [],
            genres: [],
            language: "Português",
            publisher: String(book.publisher ?? book.editora ?? "").trim() || null,
            isbn: isbn || null,
            published_date: book.year || book.ano ? String(book.year ?? book.ano) : null,
            source_url: skoobUrl || null,
          });
        }
      } catch (error) {
        console.warn("Skoob indisponível:", error);
      }
    }

    // Open Library: duas páginas de até 100 resultados por idioma.
    if (category !== "novels") {
      const openLibrarySearches = await Promise.all([
        { code: "por", label: "Português" },
        { code: "eng", label: "Inglês" },
      ].map(async ({ code, label }) => {
        try {
          const chunks = await Promise.all(Array.from({ length: 5 }, async (_, chunk) => {
            const params = new URLSearchParams({
              q: q + " language:" + code,
              limit: "100",
              offset: String(Math.max(offset, 0) + chunk * 100),
              fields: "key,title,author_name,cover_i,first_publish_year,edition_count,subject,isbn,language,publisher,publish_date",
            });
            const response = await fetch("https://openlibrary.org/search.json?" + params.toString());
            if (!response.ok) return [];
            const payload = await response.json();
            return (payload.docs ?? []).flatMap((doc: any) => {
              const title = String(doc.title ?? "").trim();
              if (!title) return [];
              return [{
                id: "openlibrary-" + String(doc.key ?? title),
                origin: "external" as const,
                title,
                authors: Array.isArray(doc.author_name) ? doc.author_name.slice(0, 5) : [],
                cover_url: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
                synopsis: null,
                kind: "livro",
                is_bl: false,
                alt_titles: [],
                genres: Array.isArray(doc.subject) ? doc.subject.slice(0, 12) : [],
                language: label,
                publisher: Array.isArray(doc.publisher) ? doc.publisher[0] ?? null : null,
                isbn: Array.isArray(doc.isbn) ? doc.isbn.find((value: string) => /^97[89]/.test(value)) ?? doc.isbn[0] ?? null : null,
                published_date: Array.isArray(doc.publish_date) ? doc.publish_date[0] ?? null : doc.publish_date ?? null,
                source_url: doc.key ? "https://openlibrary.org" + doc.key : null,
              }];
            });
          }));
          return chunks.flat();
        } catch (error) {
          console.warn("Open Library (" + code + ") indisponível:", error);
          return [];
        }
      }));
      results.push(...openLibrarySearches.flat());
    }

    // Internet Archive amplia os resultados de livros e textos catalogados.
    try {
      const escapedQuery = q.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const archiveQuery = `mediatype:text AND (title:("${escapedQuery}") OR creator:("${escapedQuery}"))`;
      const params = new URLSearchParams({
        q: archiveQuery,
        "fl[]": "identifier,title,creator,description,year,language",
        rows: "500",
        page: String(Math.floor(Math.max(offset, 0) / 500) + 1),
        output: "json",
        "sort[]": "downloads desc",
      });
      const response = await fetch("https://archive.org/advancedsearch.php?" + params.toString());
      if (response.ok) {
        const payload = await response.json();
        for (const doc of payload.response?.docs ?? []) {
          const title = String(doc.title ?? "").trim();
          if (!title) continue;
          const identifier = String(doc.identifier ?? "");
          const authors = Array.isArray(doc.creator) ? doc.creator : doc.creator ? [String(doc.creator)] : [];
          const description = Array.isArray(doc.description) ? doc.description.join(" ") : String(doc.description ?? "");
          const rawLanguage = Array.isArray(doc.language) ? doc.language[0] : doc.language;
          const language = typeof rawLanguage === "string"
            ? (/^(por|pt|pt-br|portuguese)/i.test(rawLanguage) ? "Português" : /^(eng|en|english)/i.test(rawLanguage) ? "Inglês" : rawLanguage)
            : null;
          results.push({
            id: "archive-" + (identifier || title),
            origin: "external",
            title,
            authors: authors.slice(0, 5),
            cover_url: identifier ? `https://archive.org/services/img/${encodeURIComponent(identifier)}` : null,
            synopsis: description.slice(0, 1000) || null,
            kind: category === "novels" ? "novel" : "livro",
            is_bl: false,
            alt_titles: [],
            genres: [],
            language,
          });
        }
      }
    } catch (error) {
      console.warn("Internet Archive indisponível:", error);
    }

  }
  // MangaDex fornece registros de manhwa e indica idiomas com capítulos traduzidos.
  if (["todos", "manhwas", "bl"].includes(category)) {
    try {
      const languages = ["en", "ko", "es"];
      const chunks = await Promise.all(Array.from({ length: 2 }, async (_, chunk) => {
        const params = new URLSearchParams({
          title: q,
          limit: "100",
          offset: String(Math.max(offset, 0) + chunk * 100),
          "includes[]": "cover_art",
          "originalLanguage[]": "ko",
        });
        for (const language of languages) params.append("availableTranslatedLanguage[]", language);
        const response = await fetch("https://api.mangadex.org/manga?" + params.toString());
        if (!response.ok) return [];
        const payload = await response.json();
        return (payload.data ?? []).flatMap((manga: any) => {
          const attributes = manga.attributes ?? {};
          const titleMap = attributes.title ?? {};
          const title = titleMap.en || titleMap["ko-ro"] || Object.values(titleMap)[0] || "";
          if (!title) return [];
          const cover = (manga.relationships ?? []).find((rel: any) => rel.type === "cover_art")?.attributes?.fileName;
          const available = (attributes.availableTranslatedLanguages ?? []).filter((language: string) => languages.includes(language));
          return available.map((language: string) => ({
            id: "mangadex-" + manga.id + "-" + language,
            origin: "external" as const,
            title: String(title),
            authors: (manga.relationships ?? []).filter((rel: any) => rel.type === "author" || rel.type === "artist").map((rel: any) => rel.attributes?.name).filter(Boolean).slice(0, 5),
            cover_url: cover ? `https://uploads.mangadex.org/covers/${manga.id}/${cover}.256.jpg` : null,
            synopsis: attributes.description?.en ?? attributes.description?.ko ?? null,
            kind: "manhwa",
            is_bl: false,
            alt_titles: Object.values(titleMap).map(String).filter((name: string) => name !== String(title)).slice(0, 8),
            genres: (attributes.tags ?? []).map((tag: any) => tag.attributes?.name?.en).filter(Boolean),
            language: language === "en" ? "Inglês" : language === "ko" ? "Coreano" : "Espanhol",
          }));
        });
      }));
      results.push(...chunks.flat());
    } catch (error) {
      console.warn("MangaDex indisponível:", error);
    }
  }
  if (offset === 0 && ["todos", "novels", "mangas", "manhwas", "bl"].includes(category)) {
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
  // Google Search geral + as cinco fontes públicas solicitadas. Cada fonte falha isoladamente.
  if (offset === 0) {
    try {
      const { data, error } = await supabase.functions.invoke("google-web-search", {
        body: { query: q, category, limit: 5 },
      });
      if (error) throw error;
      for (const [index, result] of (data?.results ?? []).entries()) {
        const title = String(result.title ?? "").trim();
        const url = String(result.url ?? "").trim();
        if (!title || !url || results.some((item) => item.source_url === url)) continue;
        const sourceDomain = String(result.domain ?? "");
        const isBl = category === "bl" || /boys.?love|yaoi|shounen.?ai|\\bbl\\b/i.test(title + " " + String(result.description ?? ""));
        results.push({
          id: "site-" + sourceDomain + "-" + index + "-" + title.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "-"),
          origin: "external",
          title,
          authors: Array.isArray(result.authors) ? result.authors.map(String).filter(Boolean).slice(0, 5) : [],
          cover_url: typeof result.image === "string" && result.image.startsWith("https://") ? result.image : null,
          synopsis: String(result.description ?? "").slice(0, 1000) || null,
          kind: String(result.kind ?? (category === "novels" ? "novel" : category === "manhwas" ? "manhwa" : category === "mangas" ? "manga" : "livro")),
          is_bl: isBl,
          alt_titles: [],
          genres: [],
          language: typeof result.language === "string" ? result.language : null,
          source_url: url,
        });
      }
    } catch (error) {
      console.warn("Google Search / fontes parceiras indisponíveis:", error);
    }
  }
  return results;
}

async function searchCatalog(q: string, category: CatalogCategory, limit: number, offset: number) {
  const [internal, external] = await Promise.all([
    searchInternalCatalog(q, category, Math.ceil(limit / 2), Math.floor(offset / 2)),
    searchExternalCatalog(q, category, limit, offset),
  ]);
  const normalized = (title: string) => title.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
  const merged = new Map<string, CatalogItem>();
  for (const item of [...internal, ...external]) {
    const languageKey = (item.language ?? "").toLocaleLowerCase("pt-BR");
    const key = normalized(item.title) + "|" + languageKey;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, item);
      continue;
    }
    // Combina fontes: mantém a capa, sinopse, autores e gêneros disponíveis.
    merged.set(key, {
      ...previous,
      authors: previous.authors.length ? previous.authors : item.authors,
      cover_url: previous.cover_url || item.cover_url,
      synopsis: previous.synopsis || item.synopsis,
      genres: [...new Set([...(previous.genres ?? []), ...(item.genres ?? [])])],
      alt_titles: [...new Set([...(previous.alt_titles ?? []), ...(item.alt_titles ?? [])])],
      language: previous.language || item.language,
      rating: previous.rating ?? item.rating ?? null,
      ratings_count: previous.ratings_count ?? item.ratings_count ?? null,
      publisher: previous.publisher ?? item.publisher ?? null,
      isbn: previous.isbn ?? item.isbn ?? null,
      published_date: previous.published_date ?? item.published_date ?? null,
      source_url: previous.source_url ?? item.source_url ?? null,
    });
  }
  const allItems = [...merged.values()];
  const internalItems = allItems.filter((item) => item.origin !== "external");
  const externalItems = allItems.filter((item) => item.origin === "external");
  const portuguese = externalItems.filter((item) => item.language === "Português");
  const english = externalItems.filter((item) => item.language === "Inglês");
  const korean = externalItems.filter((item) => item.language === "Coreano");
  const spanish = externalItems.filter((item) => item.language === "Espanhol");
  const other = externalItems.filter((item) => !["Português", "Inglês", "Coreano", "Espanhol"].includes(item.language ?? ""));
  const balancedExternal: CatalogItem[] = [];
  const max = Math.max(portuguese.length, english.length, korean.length, spanish.length, other.length);
  for (let index = 0; index < max; index++) {
    if (portuguese[index]) balancedExternal.push(portuguese[index]);
    if (english[index]) balancedExternal.push(english[index]);
    if (korean[index]) balancedExternal.push(korean[index]);
    if (spanish[index]) balancedExternal.push(spanish[index]);
    if (other[index]) balancedExternal.push(other[index]);
  }
  return [...internalItems, ...balancedExternal].slice(0, limit);
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
        {item.publisher && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">Editora: {item.publisher}</p>}
        {item.isbn && <p className="mt-0.5 text-xs text-muted-foreground">ISBN: {item.isbn}</p>}
        {item.published_date && <p className="mt-0.5 text-xs text-muted-foreground">Publicação: {item.published_date}</p>}
        {item.synopsis && <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{item.synopsis}</p>}
        {item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-xs font-medium text-primary underline-offset-4 hover:underline">Abrir na fonte original</a>}
        {typeof item.rating === "number" && <p className="mt-1 text-xs font-medium text-amber-700">★ {item.rating.toFixed(2)}{typeof item.ratings_count === "number" ? ` · ${item.ratings_count.toLocaleString("pt-BR")} avaliações` : ""}</p>}
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
