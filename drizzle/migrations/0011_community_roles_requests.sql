ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.community_members DROP CONSTRAINT IF EXISTS community_members_role_check;
ALTER TABLE public.community_members ADD CONSTRAINT community_members_role_check CHECK (role IN ('owner','admin','member'));

-- Role helpers (security definer to avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.community_role(_community uuid, _user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.community_members WHERE community_id = _community AND user_id = auth.uid() AND _user = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_community_admin(_community uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.community_members WHERE community_id = _community AND user_id = _user AND role IN ('owner','admin'))
$$;

CREATE OR REPLACE FUNCTION public.can_view_community(_community uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = _community AND (
      c.is_private = false
      OR EXISTS (SELECT 1 FROM public.community_members m WHERE m.community_id = c.id AND m.user_id = _user)
    )
  )
$$;

REVOKE ALL ON FUNCTION public.community_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_community_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_community(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_community_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_community(uuid, uuid) TO authenticated;

-- Communities: owner and admins edit; only owner changes privacy; creator never changes
DROP POLICY IF EXISTS "Creators update communities" ON public.communities;
CREATE POLICY "Owner and admins update communities" ON public.communities
FOR UPDATE TO authenticated
USING (public.is_community_admin(id, auth.uid()))
WITH CHECK (public.is_community_admin(id, auth.uid()));

CREATE OR REPLACE FUNCTION public.guard_community_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'O dono da comunidade não pode ser alterado.';
  END IF;
  IF NEW.is_private IS DISTINCT FROM OLD.is_private AND auth.uid() IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Somente o dono pode mudar a privacidade.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS communities_guard_update ON public.communities;
CREATE TRIGGER communities_guard_update BEFORE UPDATE ON public.communities
FOR EACH ROW EXECUTE FUNCTION public.guard_community_update();

-- Members: visible to anyone who can view the community
CREATE POLICY "Members visible to community viewers" ON public.community_members
FOR SELECT TO authenticated USING (public.can_view_community(community_id, auth.uid()));

DROP POLICY IF EXISTS "Members leave" ON public.community_members;
CREATE POLICY "Members and admins leave" ON public.community_members
FOR DELETE TO authenticated USING (auth.uid() = user_id AND role IN ('member','admin'));

-- Join requests for private communities
CREATE TABLE IF NOT EXISTS public.community_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.community_join_requests TO authenticated;
GRANT ALL ON public.community_join_requests TO service_role;
ALTER TABLE public.community_join_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Requester or admins see requests" ON public.community_join_requests
FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_community_admin(community_id, auth.uid()));
CREATE POLICY "Users request to join private communities" ON public.community_join_requests
FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND status = 'pending'
  AND EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_id AND c.is_private)
  AND NOT EXISTS (SELECT 1 FROM public.community_members m WHERE m.community_id = community_join_requests.community_id AND m.user_id = auth.uid())
);
CREATE POLICY "Requesters cancel own requests" ON public.community_join_requests
FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.decide_join_request(_request uuid, _approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.community_join_requests;
BEGIN
  SELECT * INTO r FROM public.community_join_requests WHERE id = _request;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;
  IF NOT public.is_community_admin(r.community_id, auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  UPDATE public.community_join_requests
    SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END, decided_by = auth.uid(), decided_at = now()
    WHERE id = _request;
  IF _approve THEN
    INSERT INTO public.community_members (community_id, user_id, role) VALUES (r.community_id, r.user_id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_community_member_role(_community uuid, _user uuid, _role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _role NOT IN ('admin','member') THEN RAISE EXCEPTION 'Papel inválido.'; END IF;
  IF public.community_role(_community, auth.uid()) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Somente o dono pode nomear administradores.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.community_members WHERE community_id = _community AND user_id = _user AND role <> 'owner') THEN RAISE EXCEPTION 'Membro inválido.'; END IF;
  UPDATE public.community_members SET role = _role WHERE community_id = _community AND user_id = _user;
END $$;

CREATE OR REPLACE FUNCTION public.remove_community_member(_community uuid, _user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE my_role text := public.community_role(_community, auth.uid());
        their_role text;
BEGIN
  SELECT role INTO their_role FROM public.community_members WHERE community_id = _community AND user_id = _user;
  IF their_role IS NULL THEN RETURN; END IF;
  IF their_role = 'owner' THEN RAISE EXCEPTION 'O dono não pode ser removido.'; END IF;
  IF my_role = 'owner' OR (my_role = 'admin' AND their_role = 'member') THEN
    DELETE FROM public.community_members WHERE community_id = _community AND user_id = _user;
  ELSE
    RAISE EXCEPTION 'Sem permissão.';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.decide_join_request(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_community_member_role(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_community_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_join_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_community_member_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_community_member(uuid, uuid) TO authenticated;

-- Listing and detail (basic info of every community, including private)
CREATE OR REPLACE FUNCTION public.list_communities(_search text DEFAULT NULL, _limit integer DEFAULT 60)
RETURNS TABLE(id uuid, slug text, name text, description text, cover_url text, avatar_url text, is_private boolean, member_count bigint, my_role text, has_request boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.slug, c.name, c.description, c.cover_url, c.avatar_url, c.is_private,
    (SELECT count(*) FROM public.community_members m WHERE m.community_id = c.id),
    public.community_role(c.id, auth.uid()),
    EXISTS (SELECT 1 FROM public.community_join_requests r WHERE r.community_id = c.id AND r.user_id = auth.uid() AND r.status = 'pending')
  FROM public.communities c
  WHERE auth.uid() IS NOT NULL
    AND (_search IS NULL OR _search = '' OR c.name ILIKE '%' || left(_search, 100) || '%' OR c.description ILIKE '%' || left(_search, 100) || '%')
  ORDER BY c.created_at DESC
  LIMIT least(greatest(coalesce(_limit, 60), 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.community_detail(_slug text)
RETURNS TABLE(id uuid, slug text, name text, description text, cover_url text, avatar_url text, is_private boolean, created_by uuid, created_at timestamptz, member_count bigint, my_role text, has_request boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.slug, c.name, c.description, c.cover_url, c.avatar_url, c.is_private, c.created_by, c.created_at,
    (SELECT count(*) FROM public.community_members m WHERE m.community_id = c.id),
    public.community_role(c.id, auth.uid()),
    EXISTS (SELECT 1 FROM public.community_join_requests r WHERE r.community_id = c.id AND r.user_id = auth.uid() AND r.status = 'pending')
  FROM public.communities c
  WHERE auth.uid() IS NOT NULL AND c.slug = _slug
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.list_communities(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.community_detail(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_communities(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_detail(text) TO authenticated;

-- Posts, comments, likes in public communities readable by signed-in readers; admins moderate
DROP POLICY IF EXISTS "Posts visible to signed-in readers" ON public.posts;
CREATE POLICY "Posts visible to signed-in readers" ON public.posts
FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND (community_id IS NULL OR public.can_view_community(community_id, auth.uid())));
CREATE POLICY "Community admins delete posts" ON public.posts
FOR DELETE TO authenticated USING (community_id IS NOT NULL AND public.is_community_admin(community_id, auth.uid()));

DROP POLICY IF EXISTS "Comments visible" ON public.comments;
CREATE POLICY "Comments visible" ON public.comments
FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id
  AND (p.community_id IS NULL OR public.can_view_community(p.community_id, auth.uid()))));
CREATE POLICY "Community admins delete comments" ON public.comments
FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id
  AND p.community_id IS NOT NULL AND public.is_community_admin(p.community_id, auth.uid())));

DROP POLICY IF EXISTS "Likes visible" ON public.likes;
CREATE POLICY "Likes visible" ON public.likes
FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = likes.post_id
  AND (p.community_id IS NULL OR public.can_view_community(p.community_id, auth.uid()))));

-- Community images: stored as {uploader}/communities/{community_id}/file, readable by community viewers
CREATE POLICY "Community viewers see community media" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'media' AND (storage.foldername(name))[2] = 'communities'
  AND (storage.foldername(name))[3] ~ '^[0-9a-f-]{36}$'
  AND public.can_view_community(((storage.foldername(name))[3])::uuid, auth.uid())
);