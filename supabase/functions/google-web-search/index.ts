import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
  return decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
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
    const limit = Math.max(1, Math.min(8, Number.parseInt(String(body.limit ?? "5"), 10) || 5));
    if (query.length < 2) return json({ error: "Digite pelo menos 2 caracteres." }, 400);

    const searchQuery = query + " livro autor book";
    const response = await fetch("https://www.google.com/search?" + new URLSearchParams({
      q: searchQuery,
      num: String(limit),
      hl: "pt-BR",
    }), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) return json({ results: [], warning: "Google respondeu HTTP " + response.status + "." });
    const html = await response.text();
    const results: { title: string; url: string; description: string }[] = [];
    const pattern = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)<\/a>/gi;

    for (const match of html.matchAll(pattern)) {
      const url = decodeHtml(match[1]);
      let hostname = "";
      try { hostname = new URL(url).hostname.toLowerCase(); } catch { continue; }
      if (!url.startsWith("https://") || /(^|\.)((google)|(youtube)|(webcache))\./.test(hostname)) continue;
      const title = cleanText(match[3]);
      const description = cleanText(match[4]).slice(0, 500);
      if (!title || results.some((item) => item.url === url)) continue;
      results.push({ title, url, description });
      if (results.length >= limit) break;
    }

    return json({
      results,
      warning: results.length ? null : "O Google não retornou resultados legíveis. A estrutura da página pode ter mudado ou a busca pode ter sido bloqueada.",
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "A busca na web demorou demais."
      : "Não foi possível consultar a busca na web agora.";
    return json({ results: [], warning: message });
  }
});
