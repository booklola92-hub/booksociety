/**
 * Calls to the approved search providers. Server-only: reads secrets from process.env.
 * Never fetches or scrapes pages of sites without a public API — those are reached only
 * through the restricted web search.
 */
import {
  anilistKind,
  anilistStatus,
  buildWebQuery,
  getSource,
  hostMatches,
  isBoysLove,
  mangaUpdatesKind,
  parseResultTitle,
  platformForUrl,
  safeImageUrl,
  sanitizeQuery,
  stripHtml,
  type SearchField,
  type SourceId,
  type WorkResult,
} from "@/lib/work-sources";

export const PAGE_SIZE = 10;
const WEB_MAX = 40;
const TIMEOUT_MS = 12_000;
const USER_AGENT = "BookSociety/1.0 (+https://booksociety.lovable.app)";

export interface ProviderPage {
  results: WorkResult[];
  hasMore: boolean;
  message?: string | null;
}

export class Unavailable extends Error {
  constructor(
    message: string,
    public kind: "unavailable" | "not_configured" | "rate_limited" = "unavailable",
  ) {
    super(message);
  }
}

async function fetchJson(url: string, init: RequestInit = {}, label = "A fonte"): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
  } catch {
    throw new Unavailable(`${label} não respondeu a tempo.`);
  }
  if (res.ok) {
    try {
      return await res.json();
    } catch {
      throw new Unavailable(`${label} respondeu num formato inesperado.`);
    }
  }
  const body = await res.text().catch(() => "");
  console.error(`Work search provider error [${res.status}] ${url.split("?")[0]}: ${body.slice(0, 400)}`);
  if (res.status === 429) throw new Unavailable(`${label} atingiu o limite de consultas. Tentaremos de novo em alguns minutos.`, "rate_limited");
  if (res.status === 402) throw new Unavailable("Os créditos da busca na internet acabaram.", "rate_limited");
  if (res.status === 400 && /API key not valid|API_KEY_INVALID/i.test(body)) {
    throw new Unavailable(`${label}: a chave configurada é inválida.`, "not_configured");
  }
  if (res.status === 403 && /accessNotConfigured|SERVICE_DISABLED/i.test(body)) {
    throw new Unavailable(`${label}: a API não está ativada no projeto da chave.`, "not_configured");
  }
  if (res.status === 401 || res.status === 403) throw new Unavailable(`${label} recusou o acesso (chave ausente ou inválida).`, "not_configured");
  if (res.status >= 500) throw new Unavailable(`${label} está fora do ar no momento (erro ${res.status}).`);
  throw new Unavailable(`${label} respondeu com erro (${res.status}).`);
}

const toInt = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null);
const uniq = (a: string[]) => [...new Set(a.map((x) => x.trim()).filter(Boolean))];

/* ---------------- Google Books ---------------- */

interface GBVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    description?: string;
    categories?: string[];
    publishedDate?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
}

export async function searchGoogleBooks(q: string, field: SearchField, page: number): Promise<ProviderPage> {
  const key = process.env["GOOGLE_BOOKS_API_KEY"];
  if (!key) throw new Unavailable("Precisa da chave GOOGLE_BOOKS_API_KEY (sem chave o Google bloqueia as buscas).", "not_configured");
  const clean = sanitizeQuery(q);
  const term = field === "titulo" ? `intitle:"${clean}"` : field === "autor" ? `inauthor:"${clean}"` : clean;
  const params = new URLSearchParams({
    q: term,
    maxResults: String(PAGE_SIZE),
    startIndex: String(page * PAGE_SIZE),
    printType: "books",
    key,
  });
  const data = (await fetchJson(`https://www.googleapis.com/books/v1/volumes?${params}`, {}, "O Google Books")) as {
    totalItems?: number;
    items?: GBVolume[];
  };
  const items = data.items ?? [];
  const results: WorkResult[] = items
    .filter((v) => v.id && v.volumeInfo?.title)
    .map((v) => {
      const info = v.volumeInfo!;
      const desc = info.description ? stripHtml(info.description) : null;
      return {
        title: info.subtitle ? `${info.title}: ${info.subtitle}` : info.title!,
        authors: info.authors ?? [],
        coverUrl: safeImageUrl(info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail),
        url: `https://books.google.com/books?id=${encodeURIComponent(v.id)}`,
        platform: "google_books" as const,
        externalId: v.id,
        snippet: desc ? desc.slice(0, 220) : null,
        synopsis: desc ? desc.slice(0, 4000) : null,
        genres: info.categories ?? [],
        kind: "livro" as const,
        year: info.publishedDate ? Number(info.publishedDate.slice(0, 4)) || null : null,
      };
    });
  return { results, hasMore: items.length > 0 && page * PAGE_SIZE + items.length < (data.totalItems ?? 0) };
}

/* ---------------- Open Library ---------------- */

interface OLDoc {
  key?: string;
  title?: string;
  subtitle?: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  subject?: string[];
  alternative_title?: string[];
}

export async function searchOpenLibrary(q: string, field: SearchField, page: number): Promise<ProviderPage> {
  const clean = sanitizeQuery(q);
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    page: String(page + 1),
    fields: "key,title,subtitle,author_name,cover_i,first_publish_year,subject,alternative_title",
  });
  if (field === "titulo") params.set("title", clean);
  else if (field === "autor") params.set("author", clean);
  else params.set("q", clean);
  const data = (await fetchJson(`https://openlibrary.org/search.json?${params}`, {}, "A Open Library")) as {
    numFound?: number;
    docs?: OLDoc[];
  };
  const docs = data.docs ?? [];
  const results: WorkResult[] = docs
    .filter((d) => d.key && d.title)
    .map((d) => ({
      title: d.subtitle ? `${d.title}: ${d.subtitle}` : d.title!,
      authors: d.author_name ?? [],
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
      url: `https://openlibrary.org${d.key}`,
      platform: "openlibrary" as const,
      externalId: d.key!,
      snippet: null,
      altTitles: uniq(d.alternative_title ?? []).slice(0, 8),
      genres: uniq(d.subject ?? []).slice(0, 8),
      kind: "livro" as const,
      year: toInt(d.first_publish_year),
    }));
  return { results, hasMore: docs.length > 0 && page * PAGE_SIZE + docs.length < (data.numFound ?? 0) };
}

/** Fetches a work's description from Open Library (used once, when its detail page is opened). */
export async function openLibraryDescription(workKey: string): Promise<string | null> {
  if (!/^\/works\/OL\d+W$/.test(workKey)) return null;
  const data = (await fetchJson(`https://openlibrary.org${workKey}.json`, {}, "A Open Library")) as {
    description?: string | { value?: string };
  };
  const d = typeof data.description === "string" ? data.description : data.description?.value;
  return d ? stripHtml(d).slice(0, 4000) : null;
}

/* ---------------- AniList ---------------- */

const ANILIST_MEDIA = `
  id siteUrl format countryOfOrigin status isAdult chapters volumes
  startDate { year }
  title { romaji english native }
  synonyms
  description(asHtml: false)
  genres
  tags { name rank isMediaSpoiler }
  coverImage { large }
  staff(perPage: 6, sort: RELEVANCE) { edges { role node { name { full } } } }
`;

interface ALMedia {
  id: number;
  format?: string | null;
  countryOfOrigin?: string | null;
  status?: string | null;
  isAdult?: boolean;
  chapters?: number | null;
  volumes?: number | null;
  startDate?: { year?: number | null };
  title?: { romaji?: string | null; english?: string | null; native?: string | null };
  synonyms?: string[];
  description?: string | null;
  genres?: string[];
  tags?: { name: string; rank: number; isMediaSpoiler: boolean }[];
  coverImage?: { large?: string | null };
  staff?: { edges?: { role?: string; node?: { name?: { full?: string } } }[] };
}

function mapAniList(m: ALMedia): WorkResult | null {
  const t = m.title ?? {};
  const title = t.english || t.romaji || t.native;
  if (!title || m.isAdult) return null;
  const tags = (m.tags ?? []).filter((x) => !x.isMediaSpoiler && x.rank >= 60).map((x) => x.name);
  const allTags = (m.tags ?? []).map((x) => x.name);
  const authors = uniq(
    (m.staff?.edges ?? [])
      .filter((e) => /story|art|original|author|creator/i.test(e.role ?? ""))
      .map((e) => e.node?.name?.full ?? ""),
  );
  const desc = m.description ? stripHtml(m.description.replace(/<br\s*\/?>/gi, " ")) : null;
  return {
    title,
    originalTitle: t.native ?? null,
    altTitles: uniq([t.romaji ?? "", t.english ?? "", ...(m.synonyms ?? [])].filter((x) => x !== title)).slice(0, 12),
    authors,
    coverUrl: safeImageUrl(m.coverImage?.large),
    url: `https://anilist.co/manga/${m.id}`,
    platform: "anilist",
    externalId: String(m.id),
    snippet: desc ? desc.slice(0, 220) : null,
    synopsis: desc ? desc.slice(0, 4000) : null,
    genres: m.genres ?? [],
    tags: tags.slice(0, 12),
    kind: anilistKind(m.format, m.countryOfOrigin),
    isBl: isBoysLove([...allTags, ...(m.genres ?? [])]),
    status: anilistStatus(m.status),
    year: toInt(m.startDate?.year),
    chapters: toInt(m.chapters),
    volumes: toInt(m.volumes),
  };
}

export async function searchAniList(q: string, field: SearchField, page: number): Promise<ProviderPage> {
  const clean = sanitizeQuery(q);
  const query =
    field === "autor"
      ? `query($s:String,$p:Int,$n:Int){Page(page:1,perPage:1){staff(search:$s){staffMedia(type:MANGA,page:$p,perPage:$n,sort:POPULARITY_DESC){pageInfo{hasNextPage} nodes{${ANILIST_MEDIA}}}}}}`
      : `query($s:String,$p:Int,$n:Int){Page(page:$p,perPage:$n){pageInfo{hasNextPage} media(search:$s,type:MANGA,isAdult:false,sort:SEARCH_MATCH){${ANILIST_MEDIA}}}}`;
  const data = (await fetchJson(
    "https://graphql.anilist.co",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { s: clean, p: page + 1, n: PAGE_SIZE } }),
    },
    "O AniList",
  )) as {
    errors?: { message?: string }[];
    data?: {
      Page?: {
        pageInfo?: { hasNextPage?: boolean };
        media?: ALMedia[];
        staff?: { staffMedia?: { pageInfo?: { hasNextPage?: boolean }; nodes?: ALMedia[] } }[];
      };
    };
  };
  if (data.errors?.length && !data.data?.Page) {
    console.error("AniList errors:", JSON.stringify(data.errors).slice(0, 400));
    throw new Unavailable("O AniList recusou a consulta.");
  }
  const pageData = data.data?.Page;
  const list = field === "autor" ? (pageData?.staff?.[0]?.staffMedia?.nodes ?? []) : (pageData?.media ?? []);
  const hasMore =
    field === "autor" ? !!pageData?.staff?.[0]?.staffMedia?.pageInfo?.hasNextPage : !!pageData?.pageInfo?.hasNextPage;
  return { results: list.map(mapAniList).filter((r): r is WorkResult => r !== null), hasMore };
}

/* ---------------- MangaUpdates ---------------- */

interface MURecord {
  series_id?: number | undefined;
  title?: string | undefined;
  url?: string | undefined;
  description?: string | undefined;
  type?: string | undefined;
  year?: string | undefined;
  image?: { url?: { original?: string; thumb?: string } } | undefined;
  genres?: { genre?: string }[] | undefined;
}

function mapMangaUpdates(rec: MURecord, hitTitle: string | undefined): WorkResult | null {
  if (!rec.series_id || !rec.title) return null;
  const url = rec.url && hostMatches(rec.url, getSource("mangaupdates").domains) ? rec.url : `https://www.mangaupdates.com/series/${rec.series_id}`;
  const genres = (rec.genres ?? []).map((g) => g.genre ?? "").filter(Boolean);
  if (genres.some((g) => /^(adult|hentai)$/i.test(g))) return null;
  const desc = rec.description ? stripHtml(rec.description.replace(/<br\s*\/?>/gi, " ")) : null;
  return {
    title: stripHtml(rec.title),
    altTitles: hitTitle && hitTitle !== rec.title ? [stripHtml(hitTitle)] : [],
    authors: [],
    coverUrl: safeImageUrl(rec.image?.url?.original ?? rec.image?.url?.thumb),
    url,
    platform: "mangaupdates",
    externalId: String(rec.series_id),
    snippet: desc ? desc.slice(0, 220) : null,
    synopsis: desc ? desc.slice(0, 4000) : null,
    genres,
    kind: mangaUpdatesKind(rec.type),
    isBl: isBoysLove(genres),
    year: rec.year ? Number(rec.year.slice(0, 4)) || null : null,
  };
}

export async function searchMangaUpdates(q: string, field: SearchField, page: number): Promise<ProviderPage> {
  const clean = sanitizeQuery(q);
  const post = (path: string, body: unknown) =>
    fetchJson(
      `https://api.mangaupdates.com/v1${path}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      "O MangaUpdates",
    );
  if (field === "autor") {
    const authors = (await post("/authors/search", { search: clean, perpage: 1 })) as {
      results?: { record?: { id?: number; name?: string } }[];
    };
    const author = authors.results?.[0]?.record;
    if (!author?.id) return { results: [], hasMore: false };
    const list = (await post(`/authors/${author.id}/series`, { orderby: "title" })) as {
      series_list?: { series_id?: number; title?: string; type?: string; genres?: string[] }[];
    };
    const all = (list.series_list ?? [])
      .map((s) =>
        mapMangaUpdates(
          { series_id: s.series_id, title: s.title, type: s.type, genres: (s.genres ?? []).map((g) => ({ genre: g })) },
          undefined,
        ),
      )
      .filter((r): r is WorkResult => r !== null)
      .map((r) => ({ ...r, authors: author.name ? [author.name] : [] }));
    const slice = all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    return { results: slice, hasMore: all.length > (page + 1) * PAGE_SIZE };
  }
  const data = (await post("/series/search", { search: clean, page: page + 1, perpage: PAGE_SIZE })) as {
    total_hits?: number;
    results?: { record?: MURecord; hit_title?: string }[];
  };
  const results = (data.results ?? [])
    .map((r) => (r.record ? mapMangaUpdates(r.record, r.hit_title) : null))
    .filter((r): r is WorkResult => r !== null);
  return { results, hasMore: (page + 1) * PAGE_SIZE < (data.total_hits ?? 0) };
}

/* ---------------- Restricted web search (Firecrawl) ---------------- */

interface WebHit {
  url?: string;
  title?: string;
  description?: string;
}

export function webSearchConfigured(): boolean {
  return !!process.env["FIRECRAWL_API_KEY"];
}

async function firecrawlSearch(query: string, limit: number): Promise<WebHit[]> {
  const key = process.env["FIRECRAWL_API_KEY"];
  if (!key) throw new Unavailable("Precisa da conexão de busca na internet (Firecrawl).", "not_configured");
  let url = "https://api.firecrawl.dev/v2/search";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key.startsWith("lovc_")) {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    if (!lovableKey) throw new Unavailable("Precisa da conexão de busca na internet (Firecrawl).", "not_configured");
    url = "https://connector-gateway.lovable.dev/firecrawl/v2/search";
    headers["Authorization"] = `Bearer ${lovableKey}`;
    headers["X-Connection-Api-Key"] = key;
  } else {
    headers["Authorization"] = `Bearer ${key}`;
  }
  const data = (await fetchJson(url, { method: "POST", headers, body: JSON.stringify({ query, limit }) }, "A busca na internet")) as {
    success?: boolean;
    error?: string;
    data?: WebHit[] | { web?: WebHit[] };
  };
  if (data.success === false) throw new Unavailable(`A busca na internet falhou: ${data.error ?? "erro desconhecido"}.`);
  return Array.isArray(data.data) ? data.data : (data.data?.web ?? []);
}

export async function searchWeb(sourceId: SourceId, q: string, field: SearchField, page: number): Promise<ProviderPage> {
  const source = getSource(sourceId);
  const limit = Math.min(PAGE_SIZE * (page + 1), WEB_MAX);
  const hits = await firecrawlSearch(buildWebQuery(q, field, [source]), limit);
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
      externalId: h.url,
      snippet: h.description ? stripHtml(h.description).slice(0, 220) : null,
      kind: "outro",
      limited: true,
    });
  }
  return { results: all.slice(page * PAGE_SIZE), hasMore: hits.length >= limit && limit < WEB_MAX };
}

/* ---------------- KakaoPage ---------------- */

export async function searchKakao(q: string, field: SearchField, page: number): Promise<ProviderPage> {
  const key = process.env["KAKAO_REST_API_KEY"];
  if (!key) {
    if (webSearchConfigured()) {
      const r = await searchWeb("kakaopage", q, field, page);
      return { ...r, message: "Chave da Kakao não configurada: usando a busca pública na internet." };
    }
    throw new Unavailable("Precisa da chave KAKAO_REST_API_KEY (ou da conexão de busca na internet).", "not_configured");
  }
  const clean = sanitizeQuery(q);
  const params = new URLSearchParams({
    query: `${field === "palavra" ? clean : `"${clean}"`} site:page.kakao.com`,
    page: String(page + 1),
    size: String(PAGE_SIZE),
  });
  const data = (await fetchJson(
    `https://dapi.kakao.com/v2/search/web?${params}`,
    { headers: { Authorization: `KakaoAK ${key}` } },
    "A Kakao",
  )) as { meta?: { is_end?: boolean }; documents?: { title?: string; contents?: string; url?: string }[] };
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
      externalId: d.url,
      snippet: d.contents ? stripHtml(d.contents).slice(0, 220) : null,
      kind: "outro",
      limited: true,
    });
  }
  return { results, hasMore: data.meta?.is_end === false };
}

/* ---------------- Dispatcher ---------------- */

export function runProvider(source: SourceId, q: string, field: SearchField, page: number): Promise<ProviderPage> {
  switch (getSource(source).method) {
    case "google_books_api":
      return searchGoogleBooks(q, field, page);
    case "openlibrary_api":
      return searchOpenLibrary(q, field, page);
    case "anilist_api":
      return searchAniList(q, field, page);
    case "mangaupdates_api":
      return searchMangaUpdates(q, field, page);
    case "kakao_api_or_web":
      return searchKakao(q, field, page);
    default:
      return searchWeb(source, q, field, page);
  }
}
