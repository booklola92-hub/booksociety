-- Return only public profile fields for accounts the current user may identify.
-- Supports contact lists and notification actor names without broadening profiles table RLS.
CREATE OR REPLACE FUNCTION public.list_visible_profiles(_ids uuid[])
RETURNS TABLE (id uuid, username text, display_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id = ANY(coalesce(_ids, ARRAY[]::uuid[]))
    AND (
      p.id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.follows f
        WHERE (f.follower_id = auth.uid() AND f.following_id = p.id)
           OR (f.follower_id = p.id AND f.following_id = auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.friend_requests fr
        WHERE fr.status = 'accepted'
          AND ((fr.requester_id = auth.uid() AND fr.addressee_id = p.id)
            OR (fr.requester_id = p.id AND fr.addressee_id = auth.uid()))
      )
      OR EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = auth.uid() AND n.actor_id = p.id
      )
    )
  LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.list_visible_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_visible_profiles(uuid[]) TO authenticated;
