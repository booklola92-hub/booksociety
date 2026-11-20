
DROP POLICY "Communities visible to signed-in readers" ON public.communities;

CREATE POLICY "Creators and members view communities" ON public.communities FOR SELECT TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = communities.id AND cm.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.discover_communities(_search text DEFAULT NULL, _limit int DEFAULT 50)
RETURNS TABLE (id uuid, slug text, name text, description text, cover_url text, member_count bigint, is_member boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.slug, c.name, c.description, c.cover_url,
         (SELECT count(*) FROM public.community_members m WHERE m.community_id = c.id) AS member_count,
         EXISTS (SELECT 1 FROM public.community_members m WHERE m.community_id = c.id AND m.user_id = auth.uid()) AS is_member
  FROM public.communities c
  WHERE auth.uid() IS NOT NULL
    AND (
      _search IS NULL OR _search = ''
      OR c.name ILIKE '%' || left(_search, 100) || '%'
      OR c.description ILIKE '%' || left(_search, 100) || '%'
    )
  ORDER BY member_count DESC, c.created_at DESC
  LIMIT least(greatest(coalesce(_limit, 50), 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.get_community(_slug text)
RETURNS TABLE (id uuid, slug text, name text, description text, cover_url text, member_count bigint, is_member boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.slug, c.name, c.description, c.cover_url,
         (SELECT count(*) FROM public.community_members m WHERE m.community_id = c.id) AS member_count,
         EXISTS (SELECT 1 FROM public.community_members m WHERE m.community_id = c.id AND m.user_id = auth.uid()) AS is_member
  FROM public.communities c
  WHERE auth.uid() IS NOT NULL AND c.slug = _slug
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.discover_communities(text, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_community(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discover_communities(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community(text) TO authenticated;
