CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Catalog of works found through the approved sources. Written only by the server.
CREATE TABLE public.works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  original_title text,
  alt_titles text[] NOT NULL DEFAULT '{}',
  authors text[] NOT NULL DEFAULT '{}',
  synopsis text,
  genres text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  kind text NOT NULL DEFAULT 'outro' CHECK (kind IN ('livro','novel','webnovel','manhwa','manga','manhua','outro')),
  is_bl boolean NOT NULL DEFAULT false,
  status text CHECK (status IN ('em_andamento','completo','hiato','cancelado','nao_lancado')),
  year integer,
  chapters integer,
  volumes integer,
  cover_url text,
  limited boolean NOT NULL DEFAULT false,
  title_keys text[] NOT NULL DEFAULT '{}',
  search_titles text NOT NULL DEFAULT '',
  search_authors text NOT NULL DEFAULT '',
  enriched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.works TO service_role;
ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;
CREATE INDEX works_title_keys_idx ON public.works USING gin (title_keys);
CREATE INDEX works_search_titles_trgm ON public.works USING gin (search_titles extensions.gin_trgm_ops);
CREATE INDEX works_search_authors_trgm ON public.works USING gin (search_authors extensions.gin_trgm_ops);
CREATE TRIGGER works_touch_updated_at BEFORE UPDATE ON public.works
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Where each work was found (one row per source record).
CREATE TABLE public.work_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  source text NOT NULL,
  external_id text NOT NULL,
  source_url text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);
GRANT ALL ON public.work_sources TO service_role;
ALTER TABLE public.work_sources ENABLE ROW LEVEL SECURITY;
CREATE INDEX work_sources_work_idx ON public.work_sources (work_id);

-- Search cache and request counters (server only).
CREATE TABLE public.work_search_cache (
  cache_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.work_search_cache TO service_role;
ALTER TABLE public.work_search_cache ENABLE ROW LEVEL SECURITY;
CREATE INDEX work_search_cache_expires_idx ON public.work_search_cache (expires_at);

CREATE TABLE public.work_search_rate (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
GRANT ALL ON public.work_search_rate TO service_role;
ALTER TABLE public.work_search_rate ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.hit_rate_limit(_bucket text, _limit integer, _window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _start timestamptz := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);
  _hits integer;
BEGIN
  INSERT INTO public.work_search_rate (bucket, window_start, hits)
  VALUES (_bucket, _start, 1)
  ON CONFLICT (bucket, window_start) DO UPDATE SET hits = public.work_search_rate.hits + 1
  RETURNING hits INTO _hits;
  DELETE FROM public.work_search_rate WHERE bucket = _bucket AND window_start < _start;
  RETURN _hits <= _limit;
END;
$$;
REVOKE ALL ON FUNCTION public.hit_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hit_rate_limit(text, integer, integer) TO service_role;

-- Signed-in readers search the catalog through this function (no direct table access).
CREATE OR REPLACE FUNCTION public.search_works(_q text, _field text DEFAULT 'titulo', _limit integer DEFAULT 24, _offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid, title text, original_title text, alt_titles text[], authors text[], synopsis text,
  kind text, is_bl boolean, status text, year integer, cover_url text, limited boolean, sources text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT w.id, w.title, w.original_title, w.alt_titles, w.authors, left(w.synopsis, 400),
         w.kind, w.is_bl, w.status, w.year, w.cover_url, w.limited,
         COALESCE((SELECT array_agg(DISTINCT s.source) FROM public.work_sources s WHERE s.work_id = w.id), '{}')
  FROM public.works w
  WHERE auth.uid() IS NOT NULL
    AND length(trim(_q)) > 0
    AND CASE
      WHEN _field = 'autor' THEN w.search_authors ILIKE '%' || _q || '%' OR _q <% w.search_authors
      WHEN _field = 'palavra' THEN w.search_titles ILIKE '%' || _q || '%' OR w.search_authors ILIKE '%' || _q || '%'
           OR lower(COALESCE(w.synopsis, '')) ILIKE '%' || _q || '%' OR _q <% w.search_titles
      ELSE w.search_titles ILIKE '%' || _q || '%' OR _q <% w.search_titles
    END
  ORDER BY word_similarity(_q, CASE WHEN _field = 'autor' THEN w.search_authors ELSE w.search_titles END) DESC,
           w.limited ASC, w.updated_at DESC
  LIMIT least(greatest(COALESCE(_limit, 24), 1), 50)
  OFFSET greatest(COALESCE(_offset, 0), 0);
$$;
REVOKE ALL ON FUNCTION public.search_works(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_works(text, text, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_work(_id uuid)
RETURNS TABLE(
  id uuid, title text, original_title text, alt_titles text[], authors text[], synopsis text,
  genres text[], tags text[], kind text, is_bl boolean, status text, year integer, chapters integer,
  volumes integer, cover_url text, limited boolean, sources text[], created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.id, w.title, w.original_title, w.alt_titles, w.authors, w.synopsis, w.genres, w.tags,
         w.kind, w.is_bl, w.status, w.year, w.chapters, w.volumes, w.cover_url, w.limited,
         COALESCE((SELECT array_agg(DISTINCT s.source) FROM public.work_sources s WHERE s.work_id = w.id), '{}'),
         w.created_at, w.updated_at
  FROM public.works w
  WHERE auth.uid() IS NOT NULL AND w.id = _id;
$$;
REVOKE ALL ON FUNCTION public.get_work(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_work(uuid) TO authenticated, service_role;