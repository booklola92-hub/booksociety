/* eslint-disable prettier/prettier */
import type { CatalogCategory, CatalogItem } from "@/lib/catalog-search";

export type WebCatalogItem = CatalogItem & {
  external: true;
  source: string;
  sourceId: string;
};

export interface WebCatalogSearchResult {
  items: WebCatalogItem[];
  unavailableSources: string[];
}

type OpenLibraryResponse = {
  docs?: Array<{
    key?: string;
    title?: string;
    author_name?: string[];
    cover_i?: number;
    first_sentence?: string | string[];
    subject?: string[];
  }>;
};

type AniListResponse = {
  data?: {
    Page?: {
      media?: Array<{
        id: number;
        format?: string | null;
        countryOfOrigin?: string | null;
        title?: { romaji?: string | null; english?: string | null; native?: string | null };
        description?: string | null;
        coverImage?: { large?: string | null; extraLarge?: string | null };
        genres?: string[];
        tags?: Array<{ name: string }>;
        staff?: { edges?: Array<{ node?: { name?: { full?: string | null } } }> };
      }>;
    };
  };
};

function plainText(value?: string | null) {
  return (value ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\\s+/g, " ").trim();
}

function isBl(tags: string[], genres: string[]) {
  const terms = [...tags, ...genres].map((value) => value.toLocaleLowerCase());
  return terms.some((value) => value === "boys love" || value === "yaoi" || value === "shounen ai" || value.includes("boys' love"));
}

function unique(items: WebCatalogItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.title.toLocaleLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, " ").trim()}|${item.authors.join(",").toLocaleLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchOpenLibrary(query: string): Promise<WebCatalogItem[]> {
  const params = new URLSearchParams({ q: query, limit: "20", fields: "key,title,author_name,cover_i,first_sentence,subject" });
  const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`);
  if (!response.ok) throw new Error(`Open Library respondeu ${response.status}`);
  const data = (await response.json()) as OpenLibraryResponse;
  return (data.docs ?? []).flatMap((entry) => {
    if (!entry.title) return [];
    const sentence = Array.isArray(entry.first_sentence) ? entry.first_sentence[0] : entry.first_sentence;
    return [{
      id: `web-openlibrary-${entry.key ?? entry.title}`,
      origin: "book" as const,
      title: entry.title,
      authors: entry.author_name ?? [],
      cover_url: entry.cover_i ? `https://covers.openlibrary.org/b/id/${entry.cover_i}-M.jpg` : null,
      synopsis: plainText(sentence) || null,
      kind: "livro",
      is_bl: (entry.subject ?? []).some((subject) => /boys.? love|yaoi/i.test(subject)),
      alt_titles: [],
      external: true as const,
      source: "Open Library",
      sourceId: entry.key ?? entry.title,
    }];
  });
}

async function searchAniList(query: string): Promise<WebCatalogItem[]> {
  const gql = `query ($search: String!) {
    Page(page: 1, perPage: 30) {
      media(search: $search, type: MANGA, isAdult: false, sort: SEARCH_MATCH) {
        id
        format
        countryOfOrigin
        title { romaji english native }
        description(asHtml: false)
        coverImage { large extraLarge }
        genres
        tags { name }
        staff(perPage: 4) { edges { node { name { full } } } }
      }
    }
  }`;
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: gql, variables: { search: query } }),
  });
  if (!response.ok) throw new Error(`AniList respondeu ${response.status}`);
  const data = (await response.json()) as AniListResponse;
  return (data.data?.Page?.media ?? []).flatMap((entry) => {
    const title = entry.title?.english || entry.title?.romaji || entry.title?.native;
    if (!title) return [];
    const genres = entry.genres ?? [];
    const tags = (entry.tags ?? []).map((tag) => tag.name);
    const authors = (entry.staff?.edges ?? []).map((edge) => edge.node?.name?.full ?? "").filter(Boolean);
    const format = entry.format === "NOVEL" ? "novel" : entry.countryOfOrigin === "KR" ? "manhwa" : "manga";
    return [{
      id: `web-anilist-${entry.id}`,
      origin: "work" as const,
      title,
      authors,
      cover_url: entry.coverImage?.extraLarge ?? entry.coverImage?.large ?? null,
      synopsis: plainText(entry.description) || null,
      kind: format,
      is_bl: isBl(tags, genres),
      alt_titles: [entry.title?.romaji, entry.title?.native].filter((value): value is string => Boolean(value && value !== title)),
      external: true as const,
      source: "AniList",
      sourceId: String(entry.id),
    }];
  });
}

function matchesCategory(item: WebCatalogItem, category: CatalogCategory) {
  switch (category) {
    case "livros": return item.kind === "livro";
    case "novels": return item.kind === "novel" || item.kind === "livro";
    case "mangas": return item.kind === "manga";
    case "manhwas": return item.kind === "manhwa";
    case "bl": return item.is_bl;
    default: return true;
  }
}

export async function searchWebCatalog(query: string, category: CatalogCategory): Promise<WebCatalogSearchResult> {
  const tasks: Array<{ name: string; run: () => Promise<WebCatalogItem[]> }> = [];
  if (["todos", "livros", "novels", "bl"].includes(category)) {
    tasks.push({ name: "Open Library", run: () => searchOpenLibrary(query) });
  }
  if (category !== "livros") tasks.push({ name: "AniList", run: () => searchAniList(query) });

  const settled = await Promise.allSettled(tasks.map((task) => task.run()));
  const items: WebCatalogItem[] = [];
  const unavailableSources: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") items.push(...result.value);
    else unavailableSources.push(tasks[index]?.name ?? "Fonte");
  });

  return { items: unique(items.filter((item) => matchesCategory(item, category))), unavailableSources };
}
