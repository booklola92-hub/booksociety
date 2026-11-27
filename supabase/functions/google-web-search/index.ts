/* eslint-disable prettier/prettier */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SOURCES = [
  { domain: "leituramanga.net", name: "Leitura Manga", kind: "manga", language: "Português", categories: ["todos", "mangas", "manhwas", "bl"] },
  { domain: "viralikigai.radiot.space", name: "Viral Ikigai", kind: "novel", language: null, categories: ["todos", "novels", "bl"] },
  { domain: "ridibooks.com", name: "RidiBooks", kind: "novel", language: "Coreano", categories: ["todos", "novels", "manhwas", "bl"] },
  { domain: "webtoons.com", name: "WEBTOON", kind: "manhwa", language: "Inglês", categories: ["todos", "mangas", "manhwas", "bl"] },
  { domain: "series.naver.com", name: "Naver Series", kind: "novel", language: "Coreano", categories: ["todos", "novels", "manhwas", "bl"] },
] as const;

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function cleanText(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return cleanText(match[1]);
    }
  }
  return null;
}

async function pageMetadata(url: string, allowedDomain: string): Promise<{ image: string | null; author: string | null; description: string | null }> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !(parsed.hostname === allowedDomain || parsed.hostname.endsWith("." + allowedDomain))) {
      return { image: null, author: null, description: null };
    }
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BookSocietySearch/1.0)", "Accept": "text/html" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { image: null, author: null, description: null };
    const html = (await response.text()).slice(0, 500_000);
    const rawImage = metaContent(html, ["og:image", "twitter:image"]);
    let image: string | null = null;
    if (rawImage) {
      try {
        const parsedImage = new URL(rawImage, url);
        if (parsedImage.protocol === "https:") image = parsedImage.toString();
      } catch { /* ignore invalid image metadata */ }
    }
    return {
      image,
      author: metaContent(html, ["book:author", "article:author", "author", "dc.creator"]),
      description: metaContent(html, ["og:description", "description"]),
    };
  } catch {
    return { image: null, author: null, description: null };
  }
}

async function searchGoogle(query: string, domain: string, limit: number) {
  const response = await fetch("https://www.google.com/search?" + new URLSearchParams({
    q: query + " site:" + domain,
    num: String(Math.min(limit, 8)),
    hl: "pt-BR",
  }), {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return [];
  const html = await response.text();
  const matches: { title: string; url: string; description: string }[] = [];
  const pattern = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const url = decodeHtml(match[1]);
    let hostname = "";
    try { hostname = new URL(url).hostname.toLowerCase(); } catch { continue; }
    if (!(hostname === domain || hostname.endsWith("." + domain))) continue;
    const title = cleanText(match[3]);
    const description = cleanText(match[4]).slice(0, 500);
    if (!title || matches.some((item) => item.url === url)) continue;
    matches.push({ title, url, description });
    if (matches.length >= limit) break;
  }
  return matches;
}

Deno.serve(async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const body = await req.json();
    const query = String(body.query ?? "").trim().slice(0, 160);
    const category = String(body.category ?? "todos");
    const limit = Math.max(1, Math.min(8, Number.parseInt(String(body.limit ?? "5"), 10) || 5));
    if (query.length < 2) return json({ error: "Digite pelo menos 2 caracteres." }, 400);

    const selectedSources = SOURCES.filter((source) => source.categories.includes(category as never));
    const searches = await Promise.all(selectedSources.map(async (source) => {
      try {
        const found = await searchGoogle(query, source.domain, Math.min(limit, 5));
        const enriched = await Promise.all(found.slice(0, 3).map(async (result) => {
          const metadata = await pageMetadata(result.url, source.domain);
          return { ...result, ...metadata, description: metadata.description || result.description };
        }));
        return enriched.map((result) => ({
          ...result,
          source: source.name,
          domain: source.domain,
          kind: source.kind,
          language: source.language,
          authors: result.author ? [result.author] : [],
          image: result.image,
        }));
      } catch (error) {
        console.warn("Fonte " + source.name + " indisponível:", error);
        return [];
      }
    }));

    const results = searches.flat();
    // Mantém também a busca geral do Google, além das cinco fontes solicitadas.
    try {
      const generalResponse = await fetch("https://www.google.com/search?" + new URLSearchParams({
        q: query + " livro novel manga manhwa",
        num: "8",
        hl: "pt-BR",
      }), {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (generalResponse.ok) {
        const html = await generalResponse.text();
        const pattern = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)<\/a>/gi;
        for (const match of html.matchAll(pattern)) {
          const url = decodeHtml(match[1]);
          let hostname = "";
          try { hostname = new URL(url).hostname.toLowerCase(); } catch { continue; }
          if (!url.startsWith("https://") || /(^|\.)((google)|(youtube)|(webcache))\./.test(hostname)) continue;
          const title = cleanText(match[3]);
          if (!title || results.some((item) => item.url === url)) continue;
          results.push({
            title,
            url,
            description: cleanText(match[4]).slice(0, 500),
            source: "Google Search",
            domain: hostname,
            kind: category === "novels" ? "novel" : category === "manhwas" || category === "bl" ? "manhwa" : category === "mangas" ? "manga" : "livro",
            language: null,
            authors: [],
            image: null,
          });
          if (results.filter((item) => item.source === "Google Search").length >= limit) break;
        }
      }
    } catch (error) {
      console.warn("Google Search geral indisponível:", error);
    }
    return json({
      results,
      sources: ["Google Search", ...selectedSources.map((source) => source.name)],
      warning: results.length ? null : "As fontes não retornaram resultados públicos indexados para esta pesquisa.",
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "A busca nas fontes demorou demais."
      : "Não foi possível consultar as fontes de busca agora.";
    return json({ results: [], warning: message });
  }
});
