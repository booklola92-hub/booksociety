-- Search only public profile fields. The SECURITY DEFINER function bypasses
-- the private profiles table policy while returning no email or private metadata.
CREATE OR REPLACE FUNCTION public.search_public_profiles(
  _search text,
  _limit integer DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.avatar_url
  FROM public.profiles AS p
  WHERE auth.uid() IS NOT NULL
    AND NULLIF(trim(_search), '') IS NOT NULL
    AND (
      strpos(lower(p.display_name), lower(left(trim(_search), 80))) > 0
      OR strpos(lower(p.username), lower(left(trim(_search), 80))) > 0
    )
  ORDER BY (lower(p.username) = lower(left(trim(_search), 80))) DESC,
           lower(p.display_name), lower(p.username)
  LIMIT least(greatest(coalesce(_limit, 30), 1), 30);
$$;

REVOKE ALL ON FUNCTION public.search_public_profiles(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_public_profiles(text, integer) TO authenticated;
