-- Security remediation: profile discovery, private community media, and community-role RPCs.
-- Forward-only migration; do not edit previously applied migrations.

BEGIN;

-- Profiles: remove permissive SELECT policies (policies are OR-combined).
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "Readers can select only their own profile row"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid());

-- Profile discovery must be opt-in and return only the public card fields.
CREATE OR REPLACE FUNCTION public.search_public_profiles(_search text, _limit integer DEFAULT 30)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  q text := ltrim(lower(left(btrim(coalesce(_search, '')), 80)), '@');
BEGIN
  IF uid IS NULL OR char_length(q) < 3 THEN RETURN; END IF;
  IF NOT public.hit_rate_limit('profile-search:' || uid::text, 30, 60) THEN
    RAISE EXCEPTION 'Muitas buscas em pouco tempo. Aguarde um minuto e tente novamente.';
  END IF;
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.discoverable = true AND p.id <> uid
    AND (starts_with(lower(p.username), q)
      OR EXISTS (SELECT 1 FROM unnest(regexp_split_to_array(lower(p.display_name), '\s+')) AS w(word)
                 WHERE starts_with(w.word, q)))
  ORDER BY (lower(p.username) = q) DESC, lower(p.display_name), lower(p.username)
  LIMIT least(greatest(coalesce(_limit, 20), 1), 20);
END;
$function$;

REVOKE ALL ON FUNCTION public.search_public_profiles(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_public_profiles(text, integer) TO authenticated;

-- Keep exact username lookup limited to self, discoverable profiles, or genuine
-- existing connections/activity visible to the caller. Return card fields only.
CREATE OR REPLACE FUNCTION public.get_profile_by_username(_username text)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND lower(p.username) = ltrim(lower(left(btrim(coalesce(_username, '')), 80)), '@')
    AND (p.id = auth.uid() OR p.discoverable = true
      OR EXISTS (SELECT 1 FROM public.follows f
        WHERE (f.follower_id = auth.uid() AND f.following_id = p.id)
           OR (f.follower_id = p.id AND f.following_id = auth.uid()))
      OR EXISTS (SELECT 1 FROM public.friend_requests fr
        WHERE fr.status IN ('pending','accepted')
          AND ((fr.requester_id = auth.uid() AND fr.addressee_id = p.id)
            OR (fr.requester_id = p.id AND fr.addressee_id = auth.uid())))
      OR EXISTS (SELECT 1 FROM public.messages m
        WHERE (m.sender_id = auth.uid() AND m.recipient_id = p.id)
           OR (m.sender_id = p.id AND m.recipient_id = auth.uid())))
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.get_profile_by_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_by_username(text) TO authenticated;

-- Community-role helper RPCs must only answer for the authenticated caller.
CREATE OR REPLACE FUNCTION public.community_role(_community uuid, _user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.uid() IS NOT NULL AND _user = auth.uid()
    THEN (SELECT role FROM public.community_members
          WHERE community_id = _community AND user_id = auth.uid())
    ELSE NULL END
$$;
CREATE OR REPLACE FUNCTION public.is_community_admin(_community uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(auth.uid() IS NOT NULL AND _user = auth.uid() AND EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = _community AND user_id = auth.uid() AND role IN ('owner','admin')
  ), false)
$$;
CREATE OR REPLACE FUNCTION public.can_view_community(_community uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(auth.uid() IS NOT NULL AND _user = auth.uid() AND EXISTS (
    SELECT 1 FROM public.communities c WHERE c.id = _community
      AND (c.is_private = false OR c.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.community_members m
                   WHERE m.community_id = c.id AND m.user_id = auth.uid()))
  ), false)
$$;

-- Ensure the RPCs that mutate membership bind authorization to the target
-- community and current caller, and reject stale/non-pending requests.
CREATE OR REPLACE FUNCTION public.decide_join_request(_request uuid, _approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.community_join_requests;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  SELECT * INTO r FROM public.community_join_requests WHERE id = _request FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'pending' THEN RAISE EXCEPTION 'Solicitação inválida.'; END IF;
  IF NOT public.is_community_admin(r.community_id, auth.uid()) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  UPDATE public.community_join_requests
    SET status = CASE WHEN coalesce(_approve,false) THEN 'approved' ELSE 'rejected' END,
        decided_by = auth.uid(), decided_at = now()
    WHERE id = r.id AND status = 'pending';
  IF coalesce(_approve,false) THEN
    INSERT INTO public.community_members (community_id,user_id,role)
    VALUES (r.community_id,r.user_id,'member') ON CONFLICT DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_community_member_role(_community uuid, _user uuid, _role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_role text;
BEGIN
  IF auth.uid() IS NULL OR _role IS NULL OR _role NOT IN ('admin','member') THEN RAISE EXCEPTION 'Papel inválido.'; END IF;
  IF public.community_role(_community,auth.uid()) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Somente o dono pode nomear administradores.'; END IF;
  SELECT role INTO target_role FROM public.community_members
    WHERE community_id = _community AND user_id = _user FOR UPDATE;
  IF target_role IS NULL OR target_role = 'owner' THEN RAISE EXCEPTION 'Membro inválido.'; END IF;
  UPDATE public.community_members SET role = _role WHERE community_id = _community AND user_id = _user;
END $$;

CREATE OR REPLACE FUNCTION public.remove_community_member(_community uuid, _user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE my_role text; their_role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  my_role := public.community_role(_community,auth.uid());
  IF my_role IS NULL OR my_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  SELECT role INTO their_role FROM public.community_members
    WHERE community_id = _community AND user_id = _user FOR UPDATE;
  IF their_role IS NULL THEN RETURN; END IF;
  IF their_role = 'owner' THEN RAISE EXCEPTION 'O dono não pode ser removido.'; END IF;
  IF my_role = 'owner' OR (my_role = 'admin' AND their_role = 'member') THEN
    DELETE FROM public.community_members WHERE community_id = _community AND user_id = _user;
  ELSE RAISE EXCEPTION 'Sem permissão.'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.community_role(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_community_admin(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_community(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_join_request(uuid,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_community_member_role(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_community_member(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_role(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_community_admin(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_community(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_join_request(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_community_member_role(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_community_member(uuid,uuid) TO authenticated;

-- Storage RLS is evaluated against current membership for direct object reads.
-- Mark the media bucket private so public object URLs cannot bypass RLS.
UPDATE storage.buckets SET public = false WHERE id = 'media';

COMMIT;
