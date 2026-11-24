-- NOTE: this file is not registered in meta/_journal.json, so the migrator never runs it.
-- Its rules are applied by 0013_privacy_media_and_community_authority.sql. Kept for history only.
-- Restrict helper functions that accept a user ID to the current caller.
-- Prevents probing private community membership and admin roles.
CREATE OR REPLACE FUNCTION public.is_community_admin(_community uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user = auth.uid() AND EXISTS (
    SELECT 1
    FROM public.community_members
    WHERE community_id = _community
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_view_community(_community uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user = auth.uid() AND _user IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.communities c
    WHERE c.id = _community
      AND (
        c.is_private = false
        OR c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.community_members m
          WHERE m.community_id = c.id
            AND m.user_id = auth.uid()
        )
      )
  )
$function$;
