-- Follows: readers only see follow links they are part of.
DROP POLICY IF EXISTS "Follows visible" ON public.follows;
DROP POLICY IF EXISTS "Users see own follow links" ON public.follows;

CREATE POLICY "Users see own follow links" ON public.follows
FOR SELECT TO authenticated
USING (auth.uid() = follower_id);


-- Community members: readers only see their own memberships.
DROP POLICY IF EXISTS "Members visible" ON public.community_members;
DROP POLICY IF EXISTS "Users see own memberships" ON public.community_members;

CREATE POLICY "Users see own memberships" ON public.community_members
FOR SELECT TO authenticated
USING (auth.uid() = user_id);


-- Profiles: private profile records are only readable by their owner.
DROP POLICY IF EXISTS "Profiles visible to signed-in readers" ON public.profiles;
DROP POLICY IF EXISTS "Profiles visible to connected readers" ON public.profiles;
DROP POLICY IF EXISTS "Users see own profile" ON public.profiles;

CREATE POLICY "Users see own profile" ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = id);


-- Books: curated catalog, own additions, shelf books,
-- and books mentioned in posts visible to the reader.
DROP POLICY IF EXISTS "Books visible to signed-in readers" ON public.books;
DROP POLICY IF EXISTS "Books visible in context" ON public.books;

CREATE POLICY "Books visible in context" ON public.books
FOR SELECT TO authenticated
USING (
  created_by IS NULL
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.shelf_items s
    WHERE s.book_id = books.id
      AND s.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.book_id = books.id
  )
);


-- Indexes
CREATE INDEX IF NOT EXISTS posts_user_id_idx
  ON public.posts (user_id);

CREATE INDEX IF NOT EXISTS posts_book_id_idx
  ON public.posts (book_id);

CREATE INDEX IF NOT EXISTS comments_user_id_idx
  ON public.comments (user_id);

CREATE INDEX IF NOT EXISTS follows_following_id_idx
  ON public.follows (following_id);

CREATE INDEX IF NOT EXISTS notifications_user_actor_idx
  ON public.notifications (user_id, actor_id);

CREATE INDEX IF NOT EXISTS messages_pair_idx
  ON public.messages (sender_id, recipient_id);


-- Follower/following counts without exposing who follows whom.
CREATE OR REPLACE FUNCTION public.follow_stats(_user_id uuid)
RETURNS TABLE (
  followers bigint,
  following bigint,
  i_follow boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN _user_id = auth.uid()
      THEN (
        SELECT count(*)
        FROM public.follows f
        WHERE f.following_id = auth.uid()
      )
      ELSE 0::bigint
    END,
    CASE
      WHEN _user_id = auth.uid()
      THEN (
        SELECT count(*)
        FROM public.follows f
        WHERE f.follower_id = auth.uid()
      )
      ELSE 0::bigint
    END,
    EXISTS (
      SELECT 1
      FROM public.follows f
      WHERE f.follower_id = auth.uid()
        AND f.following_id = _user_id
    )
  WHERE auth.uid() IS NOT NULL;
$$;

REVOKE ALL
ON FUNCTION public.follow_stats(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.follow_stats(uuid)
TO authenticated;


-- Disable suggestions until profile visibility can be checked safely.
DROP FUNCTION IF EXISTS public.suggested_readers(integer);
