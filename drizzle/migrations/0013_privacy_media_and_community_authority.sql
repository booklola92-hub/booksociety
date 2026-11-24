-- 1) Profile discovery is opt-in and minimal.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS discoverable boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.profiles.discoverable IS 'Reader opted in to appear in people search. Default false.';

CREATE OR REPLACE FUNCTION public.search_public_profiles(_search text, _limit integer DEFAULT 30)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  q text := ltrim(lower(left(btrim(coalesce(_search, '')), 80)), '@');
BEGIN
  IF uid IS NULL OR char_length(q) < 3 THEN
    RETURN;
  END IF;
  IF NOT public.hit_rate_limit('profile-search:' || uid::text, 30, 60) THEN
    RAISE EXCEPTION 'Muitas buscas em pouco tempo. Aguarde um minuto e tente novamente.';
  END IF;
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.discoverable = true
    AND p.id <> uid
    AND (
      starts_with(lower(p.username), q)
      OR EXISTS (
        SELECT 1 FROM unnest(regexp_split_to_array(lower(p.display_name), '\s+')) AS w(word)
        WHERE starts_with(w.word, q)
      )
    )
  ORDER BY (lower(p.username) = q) DESC, lower(p.display_name), lower(p.username)
  LIMIT least(greatest(coalesce(_limit, 20), 1), 20);
END;
$function$;
REVOKE ALL ON FUNCTION public.search_public_profiles(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_public_profiles(text, integer) TO authenticated;

-- Exact profile lookup: only discoverable readers or readers the caller already has a real connection with.
CREATE OR REPLACE FUNCTION public.get_profile_by_username(_username text)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND lower(p.username) = ltrim(lower(left(btrim(coalesce(_username, '')), 80)), '@')
    AND (
      p.id = auth.uid()
      OR p.discoverable = true
      OR EXISTS (SELECT 1 FROM public.follows f
        WHERE (f.follower_id = auth.uid() AND f.following_id = p.id)
           OR (f.follower_id = p.id AND f.following_id = auth.uid()))
      OR EXISTS (SELECT 1 FROM public.friend_requests fr
        WHERE fr.status IN ('pending', 'accepted')
          AND ((fr.requester_id = auth.uid() AND fr.addressee_id = p.id)
            OR (fr.requester_id = p.id AND fr.addressee_id = auth.uid())))
      OR EXISTS (SELECT 1 FROM public.notifications n
        WHERE n.user_id = auth.uid() AND n.actor_id = p.id)
      OR EXISTS (SELECT 1 FROM public.messages m
        WHERE (m.sender_id = auth.uid() AND m.recipient_id = p.id)
           OR (m.sender_id = p.id AND m.recipient_id = auth.uid()))
      OR EXISTS (SELECT 1 FROM public.posts po
        WHERE po.user_id = p.id
          AND (po.community_id IS NULL OR public.can_view_community(po.community_id, auth.uid())))
      OR EXISTS (SELECT 1 FROM public.comments c JOIN public.posts po ON po.id = c.post_id
        WHERE c.user_id = p.id
          AND (po.community_id IS NULL OR public.can_view_community(po.community_id, auth.uid())))
      OR EXISTS (SELECT 1 FROM public.community_members cm
        WHERE cm.user_id = p.id AND public.can_view_community(cm.community_id, auth.uid()))
    )
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.get_profile_by_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_by_username(text) TO authenticated;

-- 2) Post images are readable only when the image belongs to the post author's own folder.
-- A post can no longer point image_url at someone else's private file to expose it.
DROP POLICY IF EXISTS "Readers see media attached to visible posts" ON storage.objects;
CREATE POLICY "Readers see media attached to visible posts" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'media'
  AND EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.image_url = objects.name
      AND (storage.foldername(objects.name))[1] = p.user_id::text
      AND (p.community_id IS NULL OR public.can_view_community(p.community_id, auth.uid()))
  )
);

-- 3) Community helpers only ever answer for the signed-in caller.
CREATE OR REPLACE FUNCTION public.community_role(_community uuid, _user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user = auth.uid() THEN (
      SELECT role FROM public.community_members
      WHERE community_id = _community AND user_id = auth.uid()
    )
    ELSE NULL
  END
$function$;

CREATE OR REPLACE FUNCTION public.is_community_admin(_community uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT coalesce(auth.uid() IS NOT NULL AND _user = auth.uid() AND EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = _community AND user_id = auth.uid() AND role IN ('owner', 'admin')
  ), false)
$function$;

CREATE OR REPLACE FUNCTION public.can_view_community(_community uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT coalesce(auth.uid() IS NOT NULL AND _user = auth.uid() AND EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = _community AND (
      c.is_private = false
      OR c.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.community_members m
        WHERE m.community_id = c.id AND m.user_id = auth.uid())
    )
  ), false)
$function$;

REVOKE ALL ON FUNCTION public.community_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_community_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_community(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_community_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_community(uuid, uuid) TO authenticated;

-- Join requests: the request row decides the community and user, it must still be pending,
-- and only an owner/admin of that same community may decide it.
CREATE OR REPLACE FUNCTION public.decide_join_request(_request uuid, _approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r public.community_join_requests;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  SELECT * INTO r FROM public.community_join_requests WHERE id = _request FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;
  IF NOT public.is_community_admin(r.community_id, auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Esta solicitação já foi respondida.'; END IF;
  UPDATE public.community_join_requests
    SET status = CASE WHEN coalesce(_approve, false) THEN 'approved' ELSE 'rejected' END,
        decided_by = auth.uid(), decided_at = now()
    WHERE id = r.id;
  IF coalesce(_approve, false) THEN
    INSERT INTO public.community_members (community_id, user_id, role)
    VALUES (r.community_id, r.user_id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.set_community_member_role(_community uuid, _user uuid, _role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE target_role text;
BEGIN
  IF auth.uid() IS NULL OR _role IS NULL OR _role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'Papel inválido.';
  END IF;
  IF public.community_role(_community, auth.uid()) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Somente o dono pode nomear administradores.';
  END IF;
  SELECT role INTO target_role FROM public.community_members
    WHERE community_id = _community AND user_id = _user FOR UPDATE;
  IF target_role IS NULL OR target_role = 'owner' THEN RAISE EXCEPTION 'Membro inválido.'; END IF;
  UPDATE public.community_members SET role = _role
    WHERE community_id = _community AND user_id = _user;
END $function$;

CREATE OR REPLACE FUNCTION public.remove_community_member(_community uuid, _user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE my_role text;
        their_role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  my_role := public.community_role(_community, auth.uid());
  IF my_role IS NULL OR my_role NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  SELECT role INTO their_role FROM public.community_members
    WHERE community_id = _community AND user_id = _user FOR UPDATE;
  IF their_role IS NULL THEN RETURN; END IF;
  IF their_role = 'owner' THEN RAISE EXCEPTION 'O dono não pode ser removido.'; END IF;
  IF my_role = 'owner' OR (my_role = 'admin' AND their_role = 'member') THEN
    DELETE FROM public.community_members WHERE community_id = _community AND user_id = _user;
  ELSE
    RAISE EXCEPTION 'Sem permissão.';
  END IF;
END $function$;

REVOKE ALL ON FUNCTION public.decide_join_request(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_community_member_role(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_community_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_join_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_community_member_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_community_member(uuid, uuid) TO authenticated;

-- Community settings and deletion are owner-only (registers the owner-only rule that was never applied).
DROP POLICY IF EXISTS "Owner and admins update communities" ON public.communities;
DROP POLICY IF EXISTS "Creators update communities" ON public.communities;
DROP POLICY IF EXISTS "Only owner updates community" ON public.communities;
CREATE POLICY "Only owner updates community" ON public.communities
FOR UPDATE TO authenticated
USING (created_by = auth.uid() AND public.community_role(id, auth.uid()) = 'owner')
WITH CHECK (created_by = auth.uid() AND public.community_role(id, auth.uid()) = 'owner');

CREATE OR REPLACE FUNCTION public.guard_community_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS DISTINCT FROM OLD.created_by
     OR public.community_role(OLD.id, auth.uid()) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Somente o dono pode editar esta comunidade.';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'O dono da comunidade não pode ser alterado.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.delete_community(_community uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = _community AND c.created_by = auth.uid()
      AND public.community_role(c.id, auth.uid()) = 'owner'
  ) THEN
    RAISE EXCEPTION 'Somente o dono pode excluir esta comunidade.';
  END IF;
  DELETE FROM public.communities WHERE id = _community;
END $function$;
REVOKE ALL ON FUNCTION public.delete_community(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_community(uuid) TO authenticated;