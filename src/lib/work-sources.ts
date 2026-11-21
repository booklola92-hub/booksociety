/**
 * Federated work search — source allowlist and pure helpers.
 * Client-safe: no secrets, no network. Every URL shown to readers must pass `isAllowedUrl`.
 */

export type SourceId =
  | "google_books"
  | "openlibrary"
  | "anilist"
  | "mangaupdates"
  | "goodreads"
  | "novel_updates"
  | "web"
  | "novellist"
  | "kakaopage"
  | "visorikigai"
  | "leituramanga"
  | "eternalmangas"
  | "lunarx"
  | "risingshadow";

export type SearchField = "titulo" | "autor" | "alternativo" | "palavra";

export const SEARCH_FIELDS: SearchField[] = ["titulo", "autor", "alternativo", "palavra"];

export type WorkKind = "livro" | "novel" | "webnovel" | "manhwa" | "manga" | "manhua" | "outro";

export type WorkStatus = "em_andamento" | "completo" | "hiato" | "cancelado" | "nao_lancado";

/** Provider = the service actually called (several sources share the web search). */
export type ProviderId = "google_books" | "openlibrary" | "anilist" | "mangaupdates" | "kakao" | "web";

export type SourceMethod =
  | "google_books_api"
  | "openlibrary_api"
  | "anilist_api"
  | "mangaupdates_api"
  | "kakao_api_or_web"
  | "web_search";

export interface WorkSource {
  id: SourceId;
  label: string;
  /** Hostnames (and their subdomains) this source may link to. */
  domains: string[];
  /** Optional path hint added to the restricted web query (e.g. only book pages). */
  pathHint?: string;
  method: SourceMethod;
  /** Plain-language note about how the source is searched. */
  note: string;
  /** Public search page on the source itself, when its URL format is known. */
  searchUrl?: (q: string) => string;
  /** Words that identify the site's name in page titles, used to clean titles. */
  nameTokens: string[];
  /** Secret the source needs before it can work at all. */
  requiresSecret?: string;
}

const enc = encodeURIComponent;

export const WORK_SOURCES: WorkSource[] = [
  {
    id: "google_books",
    label: "Google Books",
    domains: ["books.google.com"],
    method: "google_books_api",
    note: "API oficial do Google Books (precisa de chave própria).",
    searchUrl: (q) => `https://www.google.com/search?tbm=bks&q=${enc(q)}`,
    nameTokens: ["google books"],
    requiresSecret: "GOOGLE_BOOKS_API_KEY",
  },
  {
    id: "openlibrary",
    label: "Open Library",
    domains: ["openlibrary.org"],
    method: "openlibrary_api",
    note: "API pública e gratuita da Open Library (livros).",
    nameTokens: ["open library"],
  },
  {
    id: "anilist",
    label: "AniList",
    domains: ["anilist.co"],
    method: "anilist_api",
    note: "API pública e gratuita do AniList (mangás, manhwas, manhuas, light novels e webnovels).",
    nameTokens: ["anilist"],
  },
  {
    id: "mangaupdates",
    label: "MangaUpdates",
    domains: ["mangaupdates.com"],
    method: "mangaupdates_api",
    note: "API pública e gratuita do MangaUpdates (mangás, manhwas, manhuas e novels).",
    nameTokens: ["mangaupdates", "baka updates"],
  },
  {
    id: "goodreads",
    label: "Goodreads",
    domains: ["goodreads.com"],
    pathHint: "/book/show",
    method: "web_search",
    note: "O Goodreads não oferece API pública para novos projetos. Usamos só a busca pública na internet restrita a goodreads.com.",
    searchUrl: (q) => `https://www.goodreads.com/search?q=${enc(q)}`,
    nameTokens: ["goodreads"],
  },
  {
    id: "novel_updates",
    label: "Novel Updates",
    domains: ["novelupdates.com"],
    pathHint: "/series",
    method: "web_search",
    note: "Sem API pública. Busca pública na internet restrita a novelupdates.com.",
    searchUrl: (q) => `https://www.novelupdates.com/?s=${enc(q)}&post_type=seriesplans`,
    nameTokens: ["novel updates", "novelupdates"],
  },
  {
    id: "web",
    label: "Internet (fontes permitidas)",
    domains: [], // filled below with every other source's domains
    method: "web_search",
    note: "Busca geral na internet, limitada aos sites desta lista.",
    nameTokens: [],
  },
  {
    id: "novellist",
    label: "NovelList",
    domains: ["novellist.co"],
    method: "web_search",
    note: "Sem API pública. Busca pública na internet restrita a novellist.co.",
    nameTokens: ["novellist", "novel list"],
  },
  {
    id: "kakaopage",
    label: "KakaoPage",
    domains: ["page.kakao.com"],
    pathHint: "/content",
    method: "kakao_api_or_web",
    note: "Usa a API de busca da Kakao quando a chave está configurada; senão, a busca pública na internet restrita a page.kakao.com.",
    searchUrl: (q) => `https://page.kakao.com/search/result?keyword=${enc(q)}`,
    nameTokens: ["kakaopage", "kakao page", "카카오페이지"],
  },
  {
    id: "visorikigai",
    label: "Visorikigai",
    domains: ["visorikigai.net", "ikigaimangas.com"],
    method: "web_search",
    note: "Sem API pública. Busca pública na internet restrita aos endereços do Visorikigai / Ikigai Mangas.",
    nameTokens: ["visorikigai", "ikigai mangas", "ikigai"],
  },
  {
    id: "leituramanga",
    label: "LeituraManga",
    domains: ["leituramanga.net"],
    method: "web_search",
    note: "Sem API pública. Busca pública na internet restrita a leituramanga.net.",
    nameTokens: ["leitura manga", "leituramanga"],
  },
  {
    id: "eternalmangas",
    label: "EternalMangas",
    domains: ["eternalmangas.org", "eternalmangas.com"],
    method: "web_search",
    note: "Sem API pública. Busca pública na internet restrita ao EternalMangas.",
    nameTokens: ["eternalmangas", "eternal mangas"],
  },
  {
    id: "lunarx",
    label: "LunarX",
    domains: ["lunarx.to"],
    method: "web_search",
    note: "Sem API pública. Busca pública na internet restrita a lunarx.to.",
    nameTokens: ["lunarx", "lunar x"],
  },
  {
    id: "risingshadow",
    label: "RisingShadow",
    domains: ["risingshadow.net"],
    method: "web_search",
    note: "Sem API pública. Busca pública na internet restrita a risingshadow.net.",
    nameTokens: ["risingshadow", "rising shadow"],
  },
];

const webSource = WORK_SOURCES.find((s) => s.id === "web")!;
webSource.domains = WORK_SOURCES.filter((s) => s.id !== "web").flatMap((s) => s.domains);

export const SOURCE_IDS = WORK_SOURCES.map((s) => s.id);

export function getSource(id: SourceId): WorkSource {
  return WORK_SOURCES.find((s) => s.id === id)!;
}

export function isSourceId(v: string): v is SourceId {
  return (SOURCE_IDS as string[]).includes(v);
}

export function providerOf(id: SourceId): ProviderId {
  const m = getSource(id).method;
  if (m === "google_books_api") return "google_books";
  if (m === "openlibrary_api") return "openlibrary";
  if (m === "anilist_api") return "anilist";
  if (m === "mangaupdates_api") return "mangaupdates";
  if (m === "kakao_api_or_web") return "kakao";
  return "web";
}

export const KIND_LABELS: Record<WorkKind, string> = {
  livro: "Livro",
  novel: "Novel",
  webnovel: "Webnovel",
  manhwa: "Manhwa",
  manga: "Mangá",
  manhua: "Manhua",
  outro: "Tipo não informado",
};

export const STATUS_LABELS: Record<WorkStatus, string> = {
  em_andamento: "Em andamento",
  completo: "Completo",
  hiato: "Em hiato",
  cancelado: "Cancelado",
  nao_lancado: "Ainda não lançado",
};

/** Reader-facing type filters ("bl" is a flag, not a kind). */
export type KindFilter = "livro" | "novel" | "webnovel" | "bl" | "manhwa" | "manga";
export const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: "livro", label: "Livros" },
  { value: "novel", label: "Novels" },
  { value: "webnovel", label: "Webnovels" },
  { value: "bl", label: "BL" },
  { value: "manhwa", label: "Manhwa" },
  { value: "manga", label: "Mangá" },
];

export function matchesKindFilters(work: { kind: string; is_bl: boolean }, filters: KindFilter[]): boolean {
  if (filters.length === 0) return true;
  return filters.some((f) => (f === "bl" ? work.is_bl : f === "manga" ? work.kind === "manga" || work.kind === "manhua" : work.kind === f));
}

/* ---------------- Source-specific mapping ---------------- */

/** AniList format + country of origin → our kind. */
export function anilistKind(format: string | null | undefined, country: string | null | undefined): WorkKind {
  const c = (country ?? "").toUpperCase();
  if (format === "NOVEL") return c === "JP" ? "novel" : c ? "webnovel" : "novel";
  if (format === "MANGA" || format === "ONE_SHOT") {
    if (c === "KR") return "manhwa";
    if (c === "CN" || c === "TW" || c === "HK") return "manhua";
    return "manga";
  }
  return "outro";
}

export function anilistStatus(status: string | null | undefined): WorkStatus | null {
  switch (status) {
    case "RELEASING":
      return "em_andamento";
    case "FINISHED":
      return "completo";
    case "HIATUS":
      return "hiato";
    case "CANCELLED":
      return "cancelado";
    case "NOT_YET_RELEASED":
      return "nao_lancado";
    default:
      return null;
  }
}

/** MangaUpdates series type → our kind. */
export function mangaUpdatesKind(type: string | null | undefined): WorkKind {
  const t = (type ?? "").toLowerCase();
  if (t === "manhwa") return "manhwa";
  if (t === "manhua") return "manhua";
  if (t === "manga" || t === "doujinshi") return "manga";
  if (t === "novel") return "novel";
  return "outro";
}

const BL_MARKERS = ["boys love", "boys' love", "shounen ai", "shonen ai", "yaoi", "bl"];

/** True when a genre/tag list explicitly marks the work as Boys' Love. */
export function isBoysLove(labels: string[]): boolean {
  return labels.some((l) => BL_MARKERS.includes(l.trim().toLowerCase().replace(/’/g, "'")));
}

/* ---------------- Results ---------------- */

export interface WorkResult {
  title: string;
  authors: string[];
  coverUrl: string | null;
  url: string;
  /** The platform the record belongs to (detected from the URL for web results). */
  platform: SourceId;
  snippet: string | null;
  /** Stable id of the record on its platform (falls back to the URL). */
  externalId?: string;
  originalTitle?: string | null;
  altTitles?: string[];
  synopsis?: string | null;
  genres?: string[];
  tags?: string[];
  kind?: WorkKind;
  isBl?: boolean;
  status?: WorkStatus | null;
  year?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  /** True when the source only gave a title and a short snippet. */
  limited?: boolean;
}

/** A work as stored in the site's own library (what cards and detail pages show). */
export interface LibraryWork {
  id: string;
  title: string;
  original_title: string | null;
  alt_titles: string[];
  authors: string[];
  synopsis: string | null;
  kind: WorkKind;
  is_bl: boolean;
  status: WorkStatus | null;
  year: number | null;
  cover_url: string | null;
  limited: boolean;
  sources: string[];
}

export type SourceStatus = "ok" | "unavailable" | "not_configured";

export interface SourceResponse {
  source: SourceId;
  status: SourceStatus;
  message: string | null;
  /** Works saved in the library for this page of results. */
  works: LibraryWork[];
  hasMore: boolean;
}

export type HealthState = "ok" | "needs_key" | "failed";

export interface SourceHealth {
  source: SourceId;
  state: HealthState;
  message: string | null;
  checkedAt: string | null;
}

export interface MergedWork {
  key: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  snippet: string | null;
  links: { platform: SourceId; url: string }[];
}

/* ---------------- Allowlist ---------------- */

export function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

export function hostMatches(url: string, domains: string[]): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Which allowlisted platform a URL belongs to, or null when it is outside the allowlist. */
export function platformForUrl(url: string): SourceId | null {
  for (const s of WORK_SOURCES) {
    if (s.id === "web") continue;
    if (hostMatches(url, s.domains)) return s.id;
  }
  return null;
}

export function isAllowedUrl(url: string): boolean {
  return platformForUrl(url) !== null;
}

/** Cover images may come from any https host, but never from a non-http(s) scheme. */
export function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const fixed = url.replace(/^http:\/\//, "https://");
  return hostOf(fixed) ? fixed : null;
}

/* ---------------- Query building ---------------- */

/** Removes search operators and quotes the reader typed, so they cannot widen the allowlist. */
export function sanitizeQuery(q: string): string {
  return q
    .replace(/\b(site|inurl|intitle|inauthor|related|cache):\S*/gi, " ")
    .replace(/["“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function buildWebQuery(q: string, field: SearchField, sources: WorkSource[]): string {
  const clean = sanitizeQuery(q);
  const term = field === "palavra" ? clean : `"${clean}"`;
  const sites = sources.flatMap((s) =>
    s.domains.map((d) => (s.pathHint && s.id !== "web" ? `site:${d}${s.pathHint}` : `site:${d}`)),
  );
  const restriction = sites.length === 1 ? sites[0] : `(${sites.join(" OR ")})`;
  return `${term} ${restriction}`;
}

/* ---------------- Text helpers ---------------- */

export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Turns a search-result page title into a work title (and author when the
 * title states one, e.g. Goodreads "Title by Author | Goodreads").
 */
export function parseResultTitle(raw: string, platform: SourceId): { title: string; authors: string[] } {
  let title = stripHtml(raw);
  const tokens = getSource(platform).nameTokens.map(norm);
  // Drop trailing " | Site" / " - Site" / " – Site" segments that name the site.
  for (let i = 0; i < 3; i++) {
    const m = title.match(/^(.*\S)\s+[|\-–—]\s+([^|\-–—]+)$/);
    if (!m) break;
    const tail = norm(m[2]!);
    if (tokens.some((t) => t && tail.includes(t))) title = m[1]!;
    else break;
  }
  let authors: string[] = [];
  if (platform === "goodreads") {
    const m = title.match(/^(.*\S)\s+by\s+(.+)$/);
    if (m) {
      title = m[1]!;
      authors = m[2]!.split(/,\s*|\s+and\s+/).map((a) => a.trim()).filter(Boolean);
    }
  }
  return { title: title.trim() || stripHtml(raw), authors };
}

/* ---------------- Deduplication ---------------- */

export function titleKey(title: string): string {
  return norm(title);
}

/** Normalized keys for every name a work is known by (used to merge duplicates). */
export function titleKeysOf(r: { title: string; originalTitle?: string | null; altTitles?: string[] }): string[] {
  const all = [r.title, r.originalTitle ?? "", ...(r.altTitles ?? [])].map(norm).filter((k) => k.length > 0);
  return [...new Set(all)];
}

/** Normalizes what the reader typed the same way stored titles are normalized. */
export function normalizeQuery(q: string): string {
  return norm(sanitizeQuery(q)).slice(0, 120);
}

function authorKeys(authors: string[]): string[] {
  return authors.map(norm).filter(Boolean);
}

/**
 * Groups the same work found on several platforms. Two results are the same work when
 * their normalized titles match and their authors overlap (or one side has no author).
 * Keeps every platform link, and the first available cover, author list and snippet.
 */
export function dedupeWorks(results: WorkResult[]): MergedWork[] {
  const merged: (MergedWork & { tKey: string; aKeys: string[]; altKeys: string[] })[] = [];
  for (const r of results) {
    if (!isAllowedUrl(r.url)) continue;
    const tKey = titleKey(r.title);
    if (!tKey) continue;
    const keys = titleKeysOf(r);
    const aKeys = authorKeys(r.authors);
    const match = merged.find(
      (m) =>
        (m.tKey === tKey || m.altKeys.some((k) => keys.includes(k))) &&
        (m.aKeys.length === 0 || aKeys.length === 0 || aKeys.some((a) => m.aKeys.includes(a))),
    );
    if (!match) {
      merged.push({
        key: `${tKey}|${aKeys[0] ?? ""}|${merged.length}`,
        tKey,
        aKeys,
        altKeys: keys,
        title: r.title,
        authors: r.authors,
        coverUrl: r.coverUrl,
        snippet: r.snippet,
        links: [{ platform: r.platform, url: r.url }],
      });
      continue;
    }
    if (!match.coverUrl && r.coverUrl) match.coverUrl = r.coverUrl;
    if (match.authors.length === 0 && r.authors.length > 0) {
      match.authors = r.authors;
      match.aKeys = aKeys;
    }
    if (!match.snippet && r.snippet) match.snippet = r.snippet;
    if (!match.links.some((l) => l.url === r.url)) match.links.push({ platform: r.platform, url: r.url });
    match.altKeys = [...new Set([...match.altKeys, ...keys])];
  }
  return merged.map(({ tKey: _t, aKeys: _a, altKeys: _k, ...rest }) => rest);
}
