CREATE OR REPLACE FUNCTION public.search_catalog(
  _q text DEFAULT '',
  _qn text DEFAULT '',
  _category text DEFAULT 'todos',
  _limit integer DEFAULT 24,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, origin text, title text, authors text[], cover_url text, synopsis text,
  kind text, is_bl boolean, alt_titles text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT trim(COALESCE(_q, '')) AS q, trim(COALESCE(_qn, '')) AS qn, COALESCE(_category, 'todos') AS cat
  ),
  book_rows AS (
    SELECT b.id, 'book'::text AS origin, b.title, ARRAY_REMOVE(ARRAY[NULLIF(b.author, '')], NULL) AS authors,
           b.cover_url, NULLIF(b.description, '') AS synopsis, 'livro'::text AS kind, false AS is_bl,
           '{}'::text[] AS alt_titles, b.created_at AS sort_at
    FROM public.books b, params p
    WHERE p.cat IN ('todos', 'livros')
      AND (
        b.created_by IS NULL
        OR b.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.shelf_items s WHERE s.book_id = b.id AND s.user_id = auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.posts po
          WHERE po.book_id = b.id
            AND (po.community_id IS NULL OR EXISTS (
              SELECT 1 FROM public.community_members cm
              WHERE cm.community_id = po.community_id AND cm.user_id = auth.uid()
            ))
        )
      )
      AND (p.q = '' OR b.title ILIKE '%' || p.q || '%' OR b.author ILIKE '%' || p.q || '%')
  ),
  work_rows AS (
    SELECT w.id, 'work'::text AS origin, w.title, w.authors, w.cover_url, w.synopsis, w.kind, w.is_bl,
           w.alt_titles, w.created_at AS sort_at
    FROM public.works w, params p
    WHERE CASE p.cat
        WHEN 'livros' THEN w.kind = 'livro'
        WHEN 'novels' THEN w.kind IN ('novel', 'webnovel')
        WHEN 'mangas' THEN w.kind = 'manga'
        WHEN 'manhwas' THEN w.kind = 'manhwa'
        WHEN 'bl' THEN w.is_bl
        ELSE w.kind IN ('livro', 'novel', 'webnovel', 'manga', 'manhwa') OR w.is_bl
      END
      AND (
        p.q = ''
        OR w.title ILIKE '%' || p.q || '%'
        OR COALESCE(w.original_title, '') ILIKE '%' || p.q || '%'
        OR array_to_string(w.alt_titles, ' ') ILIKE '%' || p.q || '%'
        OR array_to_string(w.authors, ' ') ILIKE '%' || p.q || '%'
        OR (p.qn <> '' AND (w.search_titles ILIKE '%' || p.qn || '%' OR w.search_authors ILIKE '%' || p.qn || '%'))
      )
  )
  SELECT r.id, r.origin, r.title, r.authors, r.cover_url, left(r.synopsis, 400), r.kind, r.is_bl, r.alt_titles
  FROM (SELECT * FROM book_rows UNION ALL SELECT * FROM work_rows) r
  WHERE auth.uid() IS NOT NULL
  ORDER BY lower(r.title), r.sort_at
  LIMIT least(greatest(COALESCE(_limit, 24), 1), 50)
  OFFSET greatest(COALESCE(_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.search_catalog(text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_catalog(text, text, text, integer, integer) TO authenticated;