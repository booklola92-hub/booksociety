-- Follows: readers only see follow links they are part of.
DROP POLICY IF EXISTS "Follows visible" ON public.follows;
CREATE POLICY "Users see own follow links" ON public.follows
FOR SELECT TO authenticated
USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- Community members: readers only see their own memberships.
DROP POLICY IF EXISTS "Members visible" ON public.community_members;
CREATE POLICY "Users see own memberships" ON public.community_members
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Profiles: only yourself and readers you have a real connection with.
DROP POLICY IF EXISTS "Profiles visible to signed-in readers" ON public.profiles;
DROP POLICY IF EXISTS "Profiles visible to connected readers" ON public.profiles;

CREATE POLICY "Profiles visible to connected readers" ON public.profiles
FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR EXISTS (
    SELECT 1 FROM public.follows f
    WHERE (f.follower_id = auth.uid() AND f.following_id = profiles.id)
       OR (f.following_id = auth.uid() AND f.follower_id = profiles.id)
  )
  OR EXISTS (
    SELECT 1 FROM public.messages m
    WHERE (m.sender_id = auth.uid() AND m.recipient_id = profiles.id)
       OR (m.recipient_id = auth.uid() AND m.sender_id = profiles.id)
  )

);

-- Books: the curated catalog, your own additions, books on your shelf,
-- and books mentioned in posts you can see.
DROP POLICY IF EXISTS "Books visible to signed-in readers" ON public.books;
CREATE POLICY "Books visible in context" ON public.books
FOR SELECT TO authenticated
USING (
  created_by IS NULL
  OR created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.shelf_items s WHERE s.book_id = books.id AND s.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.posts p WHERE p.book_id = books.id)
);

CREATE INDEX IF NOT EXISTS posts_user_id_idx ON public.posts (user_id);
CREATE INDEX IF NOT EXISTS posts_book_id_idx ON public.posts (book_id);
CREATE INDEX IF NOT EXISTS comments_user_id_idx ON public.comments (user_id);
CREATE INDEX IF NOT EXISTS follows_following_id_idx ON public.follows (following_id);
CREATE INDEX IF NOT EXISTS notifications_user_actor_idx ON public.notifications (user_id, actor_id);
CREATE INDEX IF NOT EXISTS messages_pair_idx ON public.messages (sender_id, recipient_id);

-- Follower / following counts without exposing who follows whom.
CREATE OR REPLACE FUNCTION public.follow_stats(_user_id uuid)
RETURNS TABLE(followers bigint, following bigint, i_follow boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT count(*) FROM public.follows f WHERE f.following_id = _user_id),
    (SELECT count(*) FROM public.follows f WHERE f.follower_id = _user_id),
    EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.following_id = _user_id)
  WHERE auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.follow_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.follow_stats(uuid) TO authenticated;

-- Suggestions keep working for new readers, returning only public card fields.
CREATE OR REPLACE FUNCTION public.suggested_readers(_limit integer DEFAULT 5)
RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, followers bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_url,
         (SELECT count(*) FROM public.follows f WHERE f.following_id = p.id) AS followers
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.following_id = p.id)
  ORDER BY followers DESC, p.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 5), 1), 20);
$$;

REVOKE ALL ON FUNCTION public.suggested_readers(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggested_readers(integer) TO authenticated;
