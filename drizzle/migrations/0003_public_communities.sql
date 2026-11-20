
CREATE TABLE public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{3,50}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 3 AND 80),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  cover_url text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communities TO authenticated;
GRANT ALL ON public.communities TO service_role;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Communities visible to signed-in readers" ON public.communities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Readers create communities" ON public.communities FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creators update communities" ON public.communities FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creators delete communities" ON public.communities FOR DELETE TO authenticated USING (auth.uid() = created_by);

CREATE TABLE public.community_members (
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX community_members_user_idx ON public.community_members (user_id);
GRANT SELECT, INSERT, DELETE ON public.community_members TO authenticated;
GRANT ALL ON public.community_members TO service_role;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members visible" ON public.community_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Readers join as members" ON public.community_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND role = 'member');
CREATE POLICY "Members leave" ON public.community_members FOR DELETE TO authenticated USING (auth.uid() = user_id AND role = 'member');

CREATE OR REPLACE FUNCTION public.add_community_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.community_members (community_id, user_id, role) VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_community_owner() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER community_owner AFTER INSERT ON public.communities FOR EACH ROW EXECUTE FUNCTION public.add_community_owner();

ALTER TABLE public.posts ADD COLUMN community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE;
CREATE INDEX posts_community_idx ON public.posts (community_id, created_at DESC);

DROP POLICY "Users create own posts" ON public.posts;
CREATE POLICY "Users create own posts" ON public.posts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (community_id IS NULL OR EXISTS (
      SELECT 1 FROM public.community_members cm WHERE cm.community_id = posts.community_id AND cm.user_id = auth.uid()
    ))
  );
