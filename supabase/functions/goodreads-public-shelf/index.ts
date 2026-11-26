import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

function field(html: string, label: string): string {
  const safe = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(safe + "\\s*:\\s*([\\s\\S]*?)(?:<br\\s*\\/?\\s*>|$)", "i"));
  return clean(match?.[1]);
}

function parseItem(item: Element) {
  const get = (tag: string) => item.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
  const title = clean(get("title"));
  const description = get("description");
  const author = clean(get("author_name") || field(description, "Author"));
  const html = new DOMParser().parseFromString(description, "text/html");
  const imageLink = html.querySelector("img")?.getAttribute("src") ?? "";
  const bookLink = html.querySelector("a")?.getAttribute("href") ?? "";
  const ratingText = field(description, "My rating") || field(description, "Rating");
  const averageText = field(description, "Average rating");
  const dateRead = field(description, "Date read") || field(description, "Read at");
  const review = field(description, "My review") || field(description, "Review");
  const parseRating = (value: string) => {
    const n = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
  };
  return {
    title: title.slice(0, 200),
    author: author.slice(0, 120),
    imageLink: /^https:\/\//i.test(imageLink) ? imageLink : "",
    bookLink: /^https:\/\/www\.goodreads\.com\//i.test(bookLink) ? bookLink : "",
    rating: parseRating(ratingText),
    averageRating: parseRating(averageText),
    dateRead: dateRead || null,
    review: clean(review).slice(0, 3000) || null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido." }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const body = await req.json();
    const username = String(body.username ?? "").trim();
    const shelf = String(body.shelf ?? "read").trim();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(username)) {
      return new Response(JSON.stringify({ error: "Informe um usuário Goodreads válido." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["read", "to-read", "currently-reading"].includes(shelf)) {
      return new Response(JSON.stringify({ error: "Estante não permitida." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const url = new URL(`https://www.goodreads.com/review/list_rss/${encodeURIComponent(username)}`);
    url.searchParams.set("shelf", shelf);
    const response = await fetch(url, {
      headers: {
        "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "User-Agent": "BookSociety/1.0 (public bookshelf import)",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      return new Response(JSON.stringify({ error: response.status === 404
        ? "Não encontramos essa estante pública. Confira o usuário e se a estante está visível."
        : `O Goodreads não permitiu a consulta agora (HTTP ${response.status}). Tente novamente mais tarde.` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const xml = await response.text();
    if (xml.length > 2_000_000) throw new Error("A estante retornou conteúdo grande demais.");
    const document = new DOMParser().parseFromString(xml, "application/xml");
    if (document.querySelector("parsererror")) throw new Error("O Goodreads retornou um feed inválido.");
    const books = Array.from(document.getElementsByTagName("item"))
      .map(parseItem).filter((book) => book.title).slice(0, 100);
    if (!books.length) {
      return new Response(JSON.stringify({ error: "Nenhum livro foi encontrado. Verifique se o perfil e a estante são públicos." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ books, count: books.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar o Goodreads.";
    return new Response(JSON.stringify({ error: message }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
