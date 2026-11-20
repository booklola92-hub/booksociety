/**
 * Federated work search — source allowlist and pure helpers.
 * Client-safe: no secrets, no network. Every URL shown to readers must pass `isAllowedUrl`.
 */

export type SourceId =
  | "google_books"
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

export type SearchField = "titulo" | "autor" | "palavra";

export type SourceMethod = "google_books_api" | "kakao_api_or_web" | "web_search";

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
}

const enc = encodeURIComponent;

export const WORK_SOURCES: WorkSource[] = [
  {
    id: "google_books",
    label: "Google Books",
    domains: ["books.google.com"],
    method: "google_books_api",
    note: "API oficial do Google Books.",
    searchUrl: (q) => `https://www.google.com/search?tbm=bks&q=${enc(q)}`,
    nameTokens: ["google books"],
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

/* ---------------- Results ---------------- */

export interface WorkResult {
  title: string;
  authors: string[];
  coverUrl: string | null;
  url: string;
  /** The platform the link belongs to (detected from the URL). */
  platform: SourceId;
  snippet: string | null;
}

export type SourceStatus = "ok" | "unavailable" | "not_configured";

export interface SourceResponse {
  source: SourceId;
  status: SourceStatus;
  message: string | null;
  results: WorkResult[];
  hasMore: boolean;
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

function norm(s: string): string {
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

function authorKeys(authors: string[]): string[] {
  return authors.map(norm).filter(Boolean);
}

/**
 * Groups the same work found on several platforms. Two results are the same work when
 * their normalized titles match and their authors overlap (or one side has no author).
 * Keeps every platform link, and the first available cover, author list and snippet.
 */
export function dedupeWorks(results: WorkResult[]): MergedWork[] {
  const merged: (MergedWork & { tKey: string; aKeys: string[] })[] = [];
  for (const r of results) {
    if (!isAllowedUrl(r.url)) continue;
    const tKey = titleKey(r.title);
    if (!tKey) continue;
    const aKeys = authorKeys(r.authors);
    const match = merged.find(
      (m) =>
        m.tKey === tKey &&
        (m.aKeys.length === 0 || aKeys.length === 0 || aKeys.some((a) => m.aKeys.includes(a))),
    );
    if (!match) {
      merged.push({
        key: `${tKey}|${aKeys[0] ?? ""}|${merged.length}`,
        tKey,
        aKeys,
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
  }
  return merged.map(({ tKey: _t, aKeys: _a, ...rest }) => rest);
}
