import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildWebQuery,
  getSource,
  hostMatches,
  isSourceId,
  parseResultTitle,
  platformForUrl,
  safeImageUrl,
  sanitizeQuery,
  stripHtml,
  type SearchField,
  type SourceId,
  type SourceResponse,
  type WorkResult,
} from "@/lib/work-sources";

const PAGE_SIZE = 10;
const WEB_MAX = 40;
const TIMEOUT_MS = 12_000;

const inputSchema = z.object({
  source: z.string().refine(isSourceId, "Fonte desconhecida"),
  q: z.string().trim().min(1).max(200),
  field: z.enum(["titulo", "autor", "palavra"]),
  page: z.number().int().min(0).max(9),
});

type Ok = Omit<SourceResponse, "source" | "status" | "message"> & { message?: string | null };

class Unavailable extends Error {
  constructor(
    message: string,
    public kind: "unavailable" | "not_configured" = "unavailable",
  ) {
    super(message);
  }
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
  } catch {
    throw new Unavailable("A fonte não respondeu a tempo.");
  }
  if (res.status === 429) throw new Unavailable("A fonte atingiu o limite de buscas. Tente mais tarde.");
  if (res.status === 401 || res.status === 403) {
    const body = await res.text().catch(() => "");
    console.error(`Work search auth error [${res.status}] ${url.split("?")[0]}: ${body.slice(0, 300)}`);
    throw new Unavailable("A fonte recusou o acesso (chave ausente ou inválida).");
  }
  if (res.status === 402) throw new Unavailable("Os créditos da busca na internet acabaram.");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`Work search error [${res.status}] ${url.split("?")[0]}: ${body.slice(0, 300)}`);
    throw new Unavailable(`A fonte respondeu com erro (${res.status}).`);
  }
  return res.json();
}

/* ---------------- Google Books (official API) ---------------- */

interface GBVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    description?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
}

async function searchGoogleBooks(q: string, field: SearchField, page: number): Promise<Ok> {
  const clean = sanitizeQuery(q);
  const term = field === "titulo" ? `intitle:${clean}` : field === "autor" ? `inauthor:${clean}` : clean;
  const params = new URLSearchParams({
    q: term,
    maxResults: String(PAGE_SIZE),
    startIndex: String(page * PAGE_SIZE),
    printType: "books",
  });
  const key = process.env["GOOGLE_BOOKS_API_KEY"];
  if (key) params.set("key", key);
  let data: { totalItems?: number; items?: GBVolume[] };
  try {
    data = (await fetchJson(`https://www.googleapis.com/books/v1/volumes?${params}`)) as {
      totalItems?: number;
      items?: GBVolume[];
    };
  } catch (error) {
    // Google Books can return 429 (or quota-related 403) for cloud-hosted
    // requests without a project key. Keep the user's search useful by
    // falling back to Open Library instead of reporting a dead-end.
    if (error instanceof Unavailable && /limite|recusou o acesso/i.test(error.message)) {
      const fallback = await searchOpenLibrary(q, field, page);
      return {
        ...fallback,
        message: `A cota do Google Books está temporariamente indisponível. Exibindo resultados da Open Library como alternativa.`,
      };
    }
    throw error;
  }
  const items = data.items ?? [];
  const results: WorkResult[] = items
    .filter((v) => v.id && v.volumeInfo?.title)
    .map((v) => {
      const info = v.volumeInfo!;
      return {
        title: info.subtitle ? `${info.title}: ${info.subtitle}` : info.title!,
        authors: info.authors ?? [],
        coverUrl: safeImageUrl(info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail),
        url: `https://books.google.com/books?id=${encodeURIComponent(v.id)}`,
        platform: "google_books" as const,
        snippet: info.description ? stripHtml(info.description).slice(0, 220) : null,
      };
    });
  const total = data.totalItems ?? 0;
  return { results, hasMore: items.length > 0 && page * PAGE_SIZE + items.length < total };
}

/* ---------------- Open Library (public API) ---------------- */

async function searchOpenLibrary(q: string, field: SearchField, page: number): Promise<Ok> {
  const clean = sanitizeQuery(q);
  const params = new URLSearchParams({
    q: field === "autor" ? `author:${clean}` : field === "titulo" ? `title:${clean}` : clean,
    page: String(page + 1),
    limit: String(PAGE_SIZE),
    fields: "key,title,author_name,first_publish_year,cover_i",
  });
  const data = (await fetchJson(`https://openlibrary.org/search.json?${params}`)) as {
    docs?: { key?: string; title?: string; author_name?: string[]; first_publish_year?: number; cover_i?: number }[];
    numFound?: number;
  };
  const items = data.docs ?? [];
  const results: WorkResult[] = items.filter((v) => v.key && v.title).map((v) => ({
    title: v.title!, authors: v.author_name ?? [],
    coverUrl: v.cover_i ? `https://covers.openlibrary.org/b/id/${v.cover_i}-M.jpg` : null,
    url: `https://openlibrary.org${v.key}`, platform: "openlibrary",
    snippet: v.first_publish_year ? `Publicado em ${v.first_publish_year}` : null,
  }));
  return { results, hasMore: (page + 1) * PAGE_SIZE < (data.numFound ?? 0) };
}

/* ---------------- AniList (public GraphQL API) ---------------- */

async function searchAniList(q: string, field: SearchField, page: number): Promise<Ok> {
  const query = `query ($search: String, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
        id title { romaji english native } description coverImage { large }
        siteUrl startDate { year } format status chapters volumes
        staff { edges { role node { name { full } } } }
      }
    }
  }`;
  const data = (await fetchJson("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { search: sanitizeQuery(q), page: page + 1, perPage: PAGE_SIZE } }),
  })) as { errors?: { message?: string }[]; data?: { Page?: { pageInfo?: { hasNextPage?: boolean }; media?: { id: number; title?: { romaji?: string; english?: string; native?: string }; description?: string; coverImage?: { large?: string }; siteUrl?: string; startDate?: { year?: number }; format?: string; status?: string; chapters?: number; volumes?: number; staff?: { edges?: { role?: string; node?: { name?: { full?: string } } }[] } }[] } };
  if (data.errors?.length) {
    throw new Unavailable(data.errors[0]?.message || "A API do AniList não conseguiu concluir a busca.");
  }
  const items = data.data?.Page?.media ?? [];
  const results: WorkResult[] = items.filter((m) => m.siteUrl && (m.title?.english || m.title?.romaji || m.title?.native)).map((m) => ({
    title: m.title?.english || m.title?.romaji || m.title?.native || "Sem título",
    originalTitle: m.title?.native ?? null,
    altTitles: [m.title?.romaji, m.title?.english].filter((v): v is string => !!v),
    authors: (m.staff?.edges ?? []).filter((e) => /story|原作|art|作画/i.test(e.role ?? "")).map((e) => e.node?.name?.full ?? "").filter(Boolean).slice(0, 4),
    coverUrl: safeImageUrl(m.coverImage?.large), url: m.siteUrl!, platform: "anilist",
    snippet: m.description ? stripHtml(m.description).slice(0, 220) : null,
    year: m.startDate?.year ?? null, chapters: m.chapters ?? null, volumes: m.volumes ?? null,
  }));
  return { results, hasMore: !!data.data?.Page?.pageInfo?.hasNextPage };
}

/* ---------------- Restricted web search (Firecrawl) ---------------- */

interface WebHit {
  url?: string;
  title?: string;
  description?: string;
}

function webSearchConfigured(): boolean {
  return !!process.env["FIRECRAWL_API_KEY"];
}

async function firecrawlSearch(query: string, limit: number): Promise<WebHit[]> {
  const key = process.env["FIRECRAWL_API_KEY"];
  if (!key) throw new Unavailable("Busca web desativada: adicione FIRECRAWL_API_KEY em Secrets no Lovable para habilitar Goodreads, Novel Updates e os demais catálogos sem API pública.", "not_configured");
  const body = JSON.stringify({ query, limit });
  let url = "https://api.firecrawl.dev/v2/search";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key.startsWith("lovc_")) {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    if (!lovableKey) throw new Unavailable("A busca na internet ainda não foi configurada.", "not_configured");
    url = "https://connector-gateway.lovable.dev/firecrawl/v2/search";
    headers["Authorization"] = `Bearer ${lovableKey}`;
    headers["X-Connection-Api-Key"] = key;
  } else {
    headers["Authorization"] = `Bearer ${key}`;
  }
  const data = (await fetchJson(url, { method: "POST", headers, body })) as {
    data?: WebHit[] | { web?: WebHit[] };
  };
  const hits = Array.isArray(data.data) ? data.data : (data.data?.web ?? []);
  return hits;
}

async function searchWeb(sourceId: SourceId, q: string, field: SearchField, page: number): Promise<Ok> {
  const source = getSource(sourceId);
  const query = buildWebQuery(q, field, [source]);
  const limit = Math.min(PAGE_SIZE * (page + 1), WEB_MAX);
  const hits = await firecrawlSearch(query, limit);
  const all: WorkResult[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    if (!h.url || !h.title) continue;
    // Enforce the allowlist on every link, whatever the search engine returned.
    if (!hostMatches(h.url, source.domains)) continue;
    const platform = platformForUrl(h.url);
    if (!platform || seen.has(h.url)) continue;
    seen.add(h.url);
    const parsed = parseResultTitle(h.title, platform);
    all.push({
      title: parsed.title,
      authors: parsed.authors,
      coverUrl: null,
      url: h.url,
      platform,
      snippet: h.description ? stripHtml(h.description).slice(0, 220) : null,
    });
  }
  const results = all.slice(page * PAGE_SIZE);
  return { results, hasMore: hits.length >= limit && limit < WEB_MAX };
}

/* ---------------- Direct public catalog pages (no API key) ---------------- */

async function searchPublicCatalog(sourceId: SourceId, q: string, field: SearchField, page: number): Promise<Ok> {
  const source = getSource(sourceId);
  if (!source.searchUrl) throw new Unavailable("Este catálogo não disponibiliza uma URL pública de busca.");
  const query = field === "autor" ? `${sanitizeQuery(q)} ${"author"}` : sanitizeQuery(q);
  const url = source.searchUrl(query);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BooksocietyCatalog/1.0)", Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow",
    });
  } catch { throw new Unavailable("O catálogo não respondeu ou bloqueou a consulta automática."); }
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    throw new Unavailable("O site bloqueou a consulta automática. Você ainda pode abrir o catálogo pelo link de busca.");
  }
  if (!response.ok) throw new Unavailable(`O catálogo respondeu com erro (${response.status}).`);
  const html = await response.text();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\\S]*?)<\/a>/gi;
  const results: WorkResult[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html)) !== null) {
    const href = (match[1] ?? "").replace(/&amp;/g, "&");
    const title = stripHtml(match[2] ?? "").replace(/\s+/g, " ").trim();
    if (!title || title.length < 2) continue;
    let resultUrl: string;
    try { resultUrl = new URL(href, response.url || url).toString(); } catch { continue; }
    if (!hostMatches(resultUrl, source.domains) || seen.has(resultUrl)) continue;
    const parsedUrl = new URL(resultUrl);
    if (parsedUrl.pathname === "/" || /search|login|register|signup|javascript:/i.test(parsedUrl.pathname)) continue;
    if (/^(home|search|next|previous|read more|view all|login|sign up)$/i.test(title)) continue;
    seen.add(resultUrl);
    const parsed = parseResultTitle(title, sourceId);
    results.push({ title: parsed.title, authors: parsed.authors, coverUrl: null, url: resultUrl, platform: sourceId, snippet: null, limited: true });
  }
  const start = page * PAGE_SIZE;
  return { results: results.slice(start, start + PAGE_SIZE), hasMore: results.length > start + PAGE_SIZE, message: results.length ? "Resultados obtidos das páginas públicas do catálogo; alguns sites podem limitar a consulta." : "A página pública não apresentou resultados legíveis ou bloqueou a consulta automática." };
}

/* ---------------- KakaoPage (legacy API fallback) ---------------- */

async function searchKakao(q: string, field: SearchField, page: number): Promise<Ok> {
  const key = process.env["KAKAO_REST_API_KEY"];
  if (!key) {
    if (webSearchConfigured()) {
      const r = await searchWeb("kakaopage", q, field, page);
      return { ...r, message: "Chave da Kakao não configurada: usando a busca pública na internet." };
    }
    throw new Unavailable("A chave da API da Kakao não está configurada.", "not_configured");
  }
  const clean = sanitizeQuery(q);
  const params = new URLSearchParams({
    query: `${field === "palavra" ? clean : `"${clean}"`} site:page.kakao.com`,
    page: String(page + 1),
    size: String(PAGE_SIZE),
  });
  const data = (await fetchJson(`https://dapi.kakao.com/v2/search/web?${params}`, {
    headers: { Authorization: `KakaoAK ${key}` },
  })) as { meta?: { is_end?: boolean }; documents?: { title?: string; contents?: string; url?: string }[] };
  const results: WorkResult[] = [];
  for (const d of data.documents ?? []) {
    if (!d.url || !d.title || !hostMatches(d.url, getSource("kakaopage").domains)) continue;
    const parsed = parseResultTitle(d.title, "kakaopage");
    results.push({
      title: parsed.title,
      authors: parsed.authors,
      coverUrl: null,
      url: d.url,
      platform: "kakaopage",
      snippet: d.contents ? stripHtml(d.contents).slice(0, 220) : null,
    });
  }
  return { results, hasMore: data.meta?.is_end === false };
}

/* ---------------- Entry point ---------------- */

export const searchWorkSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<SourceResponse> => {
    const source = data.source as SourceId;
    const field = data.field as SearchField;
    try {
      const method = getSource(source).method;
      const r =
        method === "google_books_api"
          ? await searchGoogleBooks(data.q, field, data.page)
          : method === "openlibrary_api"
            ? await searchOpenLibrary(data.q, field, data.page)
            : method === "anilist_api"
              ? await searchAniList(data.q, field, data.page)
              : method === "kakao_api_or_web"
                ? await searchKakao(data.q, field, data.page)
                : await searchWeb(source, data.q, field, data.page);
      return { source, status: "ok", message: r.message ?? null, results: r.results, hasMore: r.hasMore };
    } catch (err) {
      if (err instanceof Unavailable) {
        return { source, status: err.kind, message: err.message, results: [], hasMore: false };
      }
      console.error(`Work search failed for ${source}:`, err);
      return { source, status: "unavailable", message: "A fonte está indisponível no momento.", results: [], hasMore: false };
    }
  });
