ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS cover_pos_x real NOT NULL DEFAULT 50 CHECK (cover_pos_x >= 0 AND cover_pos_x <= 100),
  ADD COLUMN IF NOT EXISTS cover_pos_y real NOT NULL DEFAULT 50 CHECK (cover_pos_y >= 0 AND cover_pos_y <= 100),
  ADD COLUMN IF NOT EXISTS cover_zoom real NOT NULL DEFAULT 1 CHECK (cover_zoom >= 1 AND cover_zoom <= 3);

CREATE TABLE public.community_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX community_files_community_idx ON public.community_files (community_id, created_at DESC);
CREATE INDEX community_files_uploader_idx ON public.community_files (uploader_id);

GRANT SELECT, INSERT, DELETE ON public.community_files TO authenticated;
GRANT ALL ON public.community_files TO service_role;
ALTER TABLE public.community_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Community viewers see files" ON public.community_files
  FOR SELECT TO authenticated
  USING (public.can_view_community(community_id, auth.uid()));

CREATE POLICY "Members add own files" ON public.community_files
  FOR INSERT TO authenticated
  WITH CHECK (
    uploader_id = auth.uid()
    AND public.community_role(community_id, auth.uid()) IS NOT NULL
    AND storage_path LIKE community_id::text || '/' || auth.uid()::text || '/%'
  );

CREATE POLICY "Uploader or admins delete files" ON public.community_files
  FOR DELETE TO authenticated
  USING (uploader_id = auth.uid() OR public.is_community_admin(community_id, auth.uid()));

CREATE POLICY "Community viewers read community files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'community-files'
    AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
      THEN public.can_view_community(((storage.foldername(name))[1])::uuid, auth.uid())
      ELSE false END
  );

CREATE POLICY "Members upload community files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-files'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
      THEN public.community_role(((storage.foldername(name))[1])::uuid, auth.uid()) IS NOT NULL
      ELSE false END
  );

CREATE POLICY "Uploader or admins delete community files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'community-files'
    AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
      THEN (storage.foldername(name))[2] = auth.uid()::text
        OR public.is_community_admin(((storage.foldername(name))[1])::uuid, auth.uid())
      ELSE false END
  );

DROP FUNCTION IF EXISTS public.list_communities(text, integer);
CREATE FUNCTION public.list_communities(_search text DEFAULT NULL, _limit integer DEFAULT 60)
 RETURNS TABLE(id uuid, slug text, name text, description text, cover_url text, avatar_url text, is_private boolean, member_count bigint, my_role text, has_request boolean, cover_pos_x real, cover_pos_y real, cover_zoom real)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.id, c.slug, c.name, c.description, c.cover_url, c.avatar_url, c.is_private,
    (SELECT count(*) FROM public.community_members m WHERE m.community_id = c.id),
    public.community_role(c.id, auth.uid()),
    EXISTS (SELECT 1 FROM public.community_join_requests r WHERE r.community_id = c.id AND r.user_id = auth.uid() AND r.status = 'pending'),
    c.cover_pos_x, c.cover_pos_y, c.cover_zoom
  FROM public.communities c
  WHERE auth.uid() IS NOT NULL
    AND (_search IS NULL OR _search = '' OR c.name ILIKE '%' || left(_search, 100) || '%' OR c.description ILIKE '%' || left(_search, 100) || '%')
  ORDER BY c.created_at DESC
  LIMIT least(greatest(coalesce(_limit, 60), 1), 100);
$$;

DROP FUNCTION IF EXISTS public.community_detail(text);
CREATE FUNCTION public.community_detail(_slug text)
 RETURNS TABLE(id uuid, slug text, name text, description text, cover_url text, avatar_url text, is_private boolean, created_by uuid, created_at timestamptz, member_count bigint, my_role text, has_request boolean, cover_pos_x real, cover_pos_y real, cover_zoom real)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.id, c.slug, c.name, c.description, c.cover_url, c.avatar_url, c.is_private, c.created_by, c.created_at,
    (SELECT count(*) FROM public.community_members m WHERE m.community_id = c.id),
    public.community_role(c.id, auth.uid()),
    EXISTS (SELECT 1 FROM public.community_join_requests r WHERE r.community_id = c.id AND r.user_id = auth.uid() AND r.status = 'pending'),
    c.cover_pos_x, c.cover_pos_y, c.cover_zoom
  FROM public.communities c
  WHERE auth.uid() IS NOT NULL AND c.slug = _slug
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.list_communities(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.community_detail(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_communities(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_detail(text) TO authenticated;