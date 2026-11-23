-- Security hardening for private communities and profile/follow data.
BEGIN;

-- Prevent direct RPC probing of another reader's role. Internal SECURITY DEFINER
-- routines still use this helper as its owner; ordinary callers can query only themselves.
CREATE OR REPLACE FUNCTION public.community_role(_community uuid, _user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $
  SELECT CASE
    WHEN _user = auth.uid() THEN (
      SELECT role FROM public.community_members
      WHERE community_id = _community AND user_id = _user
    )
    ELSE NULL
  END
$;
REVOKE ALL ON FUNCTION public.community_role(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_role(uuid, uuid) TO authenticated;

-- Remove permissive SELECT policies that would OR together with the safer rules.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('communities', 'community_members', 'profiles')
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

CREATE POLICY "Community metadata visible only when public or authorized"
ON public.communities FOR SELECT TO authenticated
USING (
  is_private = false
  OR created_by = auth.uid()
  OR public.community_role(id, auth.uid()) IS NOT NULL
);

CREATE POLICY "Private community membership visible only to members"
ON public.community_members FOR SELECT TO authenticated
USING (public.can_view_community(community_id, auth.uid()));

CREATE POLICY "Readers can view own profile row"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid());

-- Restrict RPCs too: SECURITY DEFINER bypasses table RLS, so every result
-- must independently enforce the private-community visibility rule.
CREATE OR REPLACE FUNCTION public.list_communities(
  _search text DEFAULT NULL, _limit integer DEFAULT 60
)
RETURNS TABLE(
  id uuid, slug text, name text, description text, cover_url text,
  avatar_url text, is_private boolean, member_count bigint, my_role text,
  has_request boolean, cover_pos_x real, cover_pos_y real, cover_zoom real
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.slug, c.name, c.description, c.cover_url, c.avatar_url,
    c.is_private,
    (SELECT count(*) FROM public.community_members m WHERE m.community_id = c.id),
    public.community_role(c.id, auth.uid()),
    EXISTS (
      SELECT 1 FROM public.community_join_requests r
      WHERE r.community_id = c.id AND r.user_id = auth.uid() AND r.status = 'pending'
    ),
    c.cover_pos_x, c.cover_pos_y, c.cover_zoom
  FROM public.communities c
  WHERE auth.uid() IS NOT NULL
    AND (
      c.is_private = false OR c.created_by = auth.uid()
      OR public.community_role(c.id, auth.uid()) IS NOT NULL
    )
    AND (_search IS NULL OR _search = ''
      OR c.name ILIKE '%' || left(_search, 100) || '%'
      OR c.description ILIKE '%' || left(_search, 100) || '%')
  ORDER BY c.created_at DESC
  LIMIT least(greatest(coalesce(_limit, 60), 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.community_detail(_slug text)
RETURNS TABLE(
  id uuid, slug text, name text, description text, cover_url text,
  avatar_url text, is_private boolean, created_by uuid, created_at timestamptz,
  member_count bigint, my_role text, has_request boolean,
  cover_pos_x real, cover_pos_y real, cover_zoom real
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.slug, c.name, c.description, c.cover_url, c.avatar_url,
    c.is_private, c.created_by, c.created_at,
    (SELECT count(*) FROM public.community_members m WHERE m.community_id = c.id),
    public.community_role(c.id, auth.uid()),
    EXISTS (
      SELECT 1 FROM public.community_join_requests r
      WHERE r.community_id = c.id AND r.user_id = auth.uid() AND r.status = 'pending'
    ),
    c.cover_pos_x, c.cover_pos_y, c.cover_zoom
  FROM public.communities c
  WHERE auth.uid() IS NOT NULL AND c.slug = _slug
    AND (
      c.is_private = false OR c.created_by = auth.uid()
      OR public.community_role(c.id, auth.uid()) IS NOT NULL
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.list_communities(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.community_detail(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_communities(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_detail(text) TO authenticated;

-- Follow totals must never disclose another reader's relationship counts.
CREATE OR REPLACE FUNCTION public.follow_stats(_user_id uuid)
RETURNS TABLE(followers bigint, following bigint, i_follow boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    CASE WHEN _user_id = auth.uid()
      THEN (SELECT count(*) FROM public.follows f WHERE f.following_id = auth.uid())
      ELSE 0::bigint END,
    CASE WHEN _user_id = auth.uid()
      THEN (SELECT count(*) FROM public.follows f WHERE f.follower_id = auth.uid())
      ELSE 0::bigint END,
    EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.follower_id = auth.uid() AND f.following_id = _user_id
    )
  WHERE auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.follow_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.follow_stats(uuid) TO authenticated;

COMMIT;
