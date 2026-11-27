import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function authorizeAndRateLimit(req: Request): Promise<Response | null> {
  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_PUBLIC_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!token || !supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Autenticação obrigatória." }, 401);
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!userResponse.ok) return json({ error: "Sessão inválida ou expirada." }, 401);

    const user = await userResponse.json();
    if (!user?.id) return json({ error: "Autenticação obrigatória." }, 401);

    const rateResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/check_paid_search_rate_limit`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ _bucket: `piloterr:${user.id}`, _limit: 8, _window_seconds: 60 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!rateResponse.ok) {
      console.error("Rate limit RPC failed:", rateResponse.status, await rateResponse.text());
      return json({ error: "Não foi possível validar o limite de buscas. Tente novamente." }, 503);
    }
    const allowed = await rateResponse.json();
    if (allowed !== true) return json({ error: "Limite de 8 buscas por minuto atingido. Aguarde e tente novamente." }, 429);
    return null;
  } catch (error) {
    console.error("Authentication/rate-limit check failed:", error);
    return json({ error: "Não foi possível validar sua sessão. Tente novamente." }, 503);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const authError = await authorizeAndRateLimit(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const query = String(body.query ?? "").trim().slice(0, 200);
    const page = Math.max(1, Math.min(10, Number.parseInt(String(body.page ?? "1"), 10) || 1));
    if (query.length < 2) return json({ error: "Digite pelo menos 2 caracteres." }, 400);

    const apiKey = Deno.env.get("PILOTERR_API_KEY");
    if (!apiKey) return json({ error: "A chave da Piloterr não está configurada no Supabase." }, 500);

    const params = new URLSearchParams({ query, page: String(page) });
    const response = await fetch(`https://api.piloterr.com/v2/goodreads/search?${params.toString()}`, {
      headers: { "x-api-key": apiKey, "Accept": "application/json" },
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? "A Piloterr recusou a chave de API. Confira o secret PILOTERR_API_KEY."
        : response.status === 402
          ? "Os créditos da Piloterr acabaram ou não são suficientes."
          : `A Piloterr respondeu com erro HTTP ${response.status}.`;
      return json({ error: message }, response.status === 402 ? 402 : 502);
    }

    const payload = await response.json();
    const results = Array.isArray(payload.results) ? payload.results.slice(0, 20) : [];
    return json({
      results: results.map((book: Record<string, unknown>) => ({
        id: String(book.id ?? ""),
        title: String(book.title ?? ""),
        authors: Array.isArray(book.authors) ? book.authors.map(String) : [],
        image: typeof book.image === "string" ? book.image : null,
        url: typeof book.url === "string" ? book.url : null,
        rating: typeof book.rating === "number" ? book.rating : null,
        ratings_count: typeof book.ratings_count === "number" ? book.ratings_count : null,
        reviews_count: typeof book.reviews_count === "number" ? book.reviews_count : null,
        series: typeof book.series === "string" ? book.series : null,
      })).filter((book: { title: string }) => book.title),
      pagination: payload.pagination ?? null,
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "A busca demorou demais. Tente novamente."
      : "Não foi possível consultar a Piloterr agora.";
    return json({ error: message }, 502);
  }
});
