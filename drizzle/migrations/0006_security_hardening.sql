-- ==========================================
-- 1. PROTEGER OS PERFIS DOS USUÁRIOS
-- ==========================================

DROP POLICY IF EXISTS
"Profiles visible to connected readers"
ON public.profiles;

CREATE POLICY "Profiles visible to connected readers"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = id

  OR EXISTS (
    SELECT 1
    FROM public.follows f
    WHERE
      (f.follower_id = auth.uid()
       AND f.following_id = profiles.id)
      OR
      (f.following_id = auth.uid()
       AND f.follower_id = profiles.id)
  )

  OR EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE
      (m.sender_id = auth.uid()
       AND m.recipient_id = profiles.id)
      OR
      (m.recipient_id = auth.uid()
       AND m.sender_id = profiles.id)
  )
);

-- Cada usuário altera somente os campos
-- permitidos do próprio perfil.

REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (
  username,
  display_name,
  avatar_url,
  bio
)
ON public.profiles TO authenticated;


-- ==========================================
-- 2. PROTEGER AS NOTIFICAÇÕES
-- ==========================================

REVOKE UPDATE ON public.notifications
FROM authenticated;

GRANT UPDATE (read)
ON public.notifications TO authenticated;


-- ==========================================
-- 3. PROTEGER AS MENSAGENS
-- ==========================================

REVOKE UPDATE ON public.messages
FROM authenticated;

GRANT UPDATE (read_at)
ON public.messages TO authenticated;


-- ==========================================
-- 4. PROTEGER COMUNIDADES PRIVADAS
-- ==========================================

ALTER TABLE public.communities
ADD COLUMN IF NOT EXISTS is_private
BOOLEAN NOT NULL DEFAULT false;


DROP POLICY IF EXISTS
"Readers join as members"
ON public.community_members;

CREATE POLICY "Readers join public communities"
ON public.community_members
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND role = 'member'
  AND EXISTS (
    SELECT 1
    FROM public.communities c
    WHERE c.id = community_id
    AND c.is_private = false
  )
);


-- ==========================================
-- 5. PROTEGER A DESCOBERTA DE COMUNIDADES
-- ==========================================

CREATE OR REPLACE FUNCTION public.discover_communities(
  _search text DEFAULT NULL,
  _limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  description text,
  cover_url text,
  member_count bigint,
  is_member boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.slug,
    c.name,
    c.description,
    c.cover_url,

    (
      SELECT count(*)
      FROM public.community_members m
      WHERE m.community_id = c.id
    ),

    EXISTS (
      SELECT 1
      FROM public.community_members m
      WHERE m.community_id = c.id
      AND m.user_id = auth.uid()
    )

  FROM public.communities c

  WHERE auth.uid() IS NOT NULL

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

  AND (
    _search IS NULL
    OR _search = ''
    OR c.name ILIKE '%' || left(_search, 100) || '%'
  )

  ORDER BY c.created_at DESC

  LIMIT least(greatest(coalesce(_limit, 50), 1), 100);
$$;


-- ==========================================
-- 6. PROTEGER DETALHES DAS COMUNIDADES
-- ==========================================

CREATE OR REPLACE FUNCTION public.get_community(
  _slug text
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  description text,
  cover_url text,
  member_count bigint,
  is_member boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.slug,
    c.name,
    c.description,
    c.cover_url,

    (
      SELECT count(*)
      FROM public.community_members m
      WHERE m.community_id = c.id
    ),

    EXISTS (
      SELECT 1
      FROM public.community_members m
      WHERE m.community_id = c.id
      AND m.user_id = auth.uid()
    )

  FROM public.communities c

  WHERE
    auth.uid() IS NOT NULL
    AND c.slug = _slug
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

  LIMIT 1;
$$;


REVOKE ALL ON FUNCTION
public.discover_communities(text, integer)
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION
public.get_community(text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
public.discover_communities(text, integer)
TO authenticated;

GRANT EXECUTE ON FUNCTION
public.get_community(text)
TO authenticated;
