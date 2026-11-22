import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Search } from "lucide-react";
import { useState, type FormEvent } from "react";

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
  type CatalogCategory,
  type CatalogItem,
} from "@/lib/catalog-search";
import { addToShelf, getMyId } from "@/lib/social";
import { searchWebCatalog, type WebCatalogItem } from "@/lib/web-catalog-search";
import { cn } from "@/lib/utils";

type DisplayItem = CatalogItem & {
  external?: boolean;
  source?: string;
  sourceId?: string;
};

export const Route = createFileRoute("/_authenticated/_shell/buscar-obras")({
  head: () => ({
    meta: [
      { title: "Buscar obras — Book Society" },
      {
        name: "description",
        content: "Pesquise em catálogos de livros, novels, mangás, manhwas e BL.",
      },
      { property: "og:title", content: "Buscar obras — Book Society" },
      {
        property: "og:description",
        content: "Encontre leituras em diferentes catálogos dentro do Book Society.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuscarObras,
});

function BuscarObras() {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [category, setCategory] = useState<CatalogCategory>("todos");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(() => new Set());
  const [addError, setAddError] = useState("");

  const results = useInfiniteQuery({
    queryKey: ["catalog-search", searched, category],
    initialPageParam: 0,
    enabled: Boolean(searched),
    staleTime: 60 * 1000,
    queryFn: async ({ pageParam }): Promise<CatalogItem[]> => {
      const { data, error } = await supabase.rpc("search_catalog", {
        _q: searched,
        _qn: "",
        _category: category,
        _limit: CATALOG_PAGE_SIZE,
        _offset: pageParam,
      });
      if (error) throw error;
      return (data ?? []) as CatalogItem[];
    },
    getNextPageParam: (last, pages) =>
      last.length === CATALOG_PAGE_SIZE ? pages.length * CATALOG_PAGE_SIZE : undefined,
  });

  const webResults = useQuery({
    queryKey: ["web-catalog-search", searched, category],
    enabled: Boolean(searched),
    staleTime: 2 * 60 * 1000,
    queryFn: () => searchWebCatalog(searched, category),
  });

  const internalItems = results.data?.pages.flat() ?? [];
  const externalItems = (webResults.data?.items ?? []) as WebCatalogItem[];
  const seen = new Set<string>();
  const items: DisplayItem[] = [...internalItems, ...externalItems].filter((item) => {
    const key = `${item.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()}|${item.authors.join(",").toLocaleLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearched(query.trim().slice(0, 200));
    setAddError("");
  };

  async function handleAddToLibrary(item: DisplayItem) {
    if (!item.external || addingId) return;
    setAddingId(item.id);
    setAddError("");
    try {
      const userId = await getMyId();
      const author = item.authors[0] ?? "Autor(a) não informado(a)";
      const { data: existing, error: lookupError } = await supabase
        .from("books")
        .select("id")
        .eq("created_by", userId)
        .eq("title", item.title)
        .eq("author", author)
        .maybeSingle();
      if (lookupError) throw lookupError;

      let bookId = existing?.id;
      if (!bookId) {
        const { data: created, error: insertError } = await supabase
          .from("books")
          .insert({
            title: item.title,
            author,
            cover_url: item.cover_url,
            description: item.synopsis ?? "",
            created_by: userId,
          })
          .select("id")
          .single();
        if (insertError) throw insertError;
        bookId = created.id;
      }

      await addToShelf(bookId, "want");
      setAddedIds((current) => new Set(current).add(item.id));
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "Não foi possível adicionar à sua biblioteca.");
    } finally {
      setAddingId(null);
    }
  }

  const isLoading = results.isLoading || webResults.isLoading;
  const sourceFailures = webResults.data?.unavailableSources ?? [];

  return (
    <div className="space-y-6">
      <PageTitle
        title="Buscar obras"
        subtitle="Pesquise em catálogos de livros, novels, light novels, mangás, manhwas e BL."
      />

      <form
        onSubmit={submitSearch}
        className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5"
      >
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
      </form>

      {searched && (
        <section className="space-y-4" aria-live="polite">
          <div className="space-y-1">
            <h2 className="font-display text-xl font-semibold">Resultados dos catálogos</h2>
            <p className="text-sm text-muted-foreground">
              Pesquisa por <strong className="text-foreground">{searched}</strong>
              {" · "}
              {CATALOG_CATEGORIES.find((item) => item.value === category)?.label}
            </p>
          </div>

          {isLoading ? (
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
          ) : results.isError && webResults.isError ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
              Não foi possível consultar os catálogos agora. Tente novamente.
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
              <p className="font-medium text-foreground">Nenhuma obra encontrada.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Tente outro título ou autor. A busca consulta os catálogos que estão disponíveis para integração.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-secondary px-2.5 py-1">Catálogo interno</span>
                <span className="rounded-full bg-secondary px-2.5 py-1">Open Library</span>
                {category !== "livros" && <span className="rounded-full bg-secondary px-2.5 py-1">AniList</span>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                  <CatalogCard
                    key={`${item.origin}-${item.id}`}
                    item={item}
                    adding={addingId === item.id}
                    added={addedIds.has(item.id)}
                    onAdd={() => void handleAddToLibrary(item)}
                  />
                ))}
              </div>
            </>
          )}

          {sourceFailures.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Algumas fontes não responderam nesta busca: {sourceFailures.join(", ")}.
            </p>
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
                Mais resultados do catálogo interno
              </Button>
            </div>
          )}
          {addError && <p role="alert" className="text-sm text-destructive">{addError}</p>}
        </section>
      )}
    </div>
  );
}

function CatalogCard({
  item,
  adding,
  added,
  onAdd,
}: {
  item: DisplayItem;
  adding: boolean;
  added: boolean;
  onAdd: () => void;
}) {
  return (
    <article className="flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <BookCover book={{ title: item.title, cover_url: item.cover_url }} className="w-24" />
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="font-display line-clamp-2 text-lg leading-snug font-semibold text-foreground">
          {item.title}
        </h2>
        <p
          className={cn(
            "mt-0.5 line-clamp-1 text-sm",
            item.authors.length ? "text-foreground/80" : "text-muted-foreground italic",
          )}
        >
          {item.authors.length ? item.authors.join(", ") : "Autor(a) não informado(a)"}
        </p>
        {item.alt_titles.length > 0 && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            Também conhecido como: {item.alt_titles.join(", ")}
          </p>
        )}
        {item.synopsis && (
          <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{item.synopsis}</p>
        )}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
            {catalogKindLabel(item.kind)}
          </span>
          {item.is_bl && (
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
              BL
            </span>
          )}
          {item.external && item.source && (
            <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
              {item.source}
            </span>
          )}
        </div>
        {item.external && (
          <Button
            type="button"
            size="sm"
            className="mt-3 w-full rounded-full"
            disabled={adding || added}
            onClick={onAdd}
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {added ? "Adicionado à biblioteca" : adding ? "Adicionando..." : "Adicionar à minha biblioteca"}
          </Button>
        )}
      </div>
    </article>
  );
}
