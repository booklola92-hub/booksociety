
-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_.]{3,30}$'),
  display_name text NOT NULL DEFAULT '',
  avatar_url text,
  bio text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own profile during setup" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  meta jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  base text;
  candidate text;
BEGIN
  base := lower(coalesce(nullif(meta->>'username', ''), split_part(coalesce(NEW.email, ''), '@', 1)));
  base := left(regexp_replace(base, '[^a-z0-9_.]', '', 'g'), 24);
  IF length(base) < 3 THEN base := 'leitor' || base; END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate) LOOP
    candidate := base || floor(random() * 10000)::int::text;
  END LOOP;
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    candidate,
    coalesce(nullif(meta->>'display_name', ''), nullif(meta->>'full_name', ''), nullif(meta->>'name', ''), candidate),
    coalesce(meta->>'avatar_url', meta->>'picture')
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- BOOKS
CREATE TABLE public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  author text NOT NULL DEFAULT '',
  cover_url text,
  pages int CHECK (pages IS NULL OR pages > 0),
  description text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.books TO authenticated;
GRANT ALL ON public.books TO service_role;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Books visible to signed-in readers" ON public.books FOR SELECT TO authenticated USING (true);
CREATE POLICY "Readers add books" ON public.books FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

INSERT INTO public.books (title, author, cover_url, pages, description) VALUES
('Orgulho e Preconceito', 'Jane Austen', 'https://covers.openlibrary.org/b/isbn/9780141439518-L.jpg?default=false', 432, 'Elizabeth Bennet e o Sr. Darcy em um dos romances mais amados de todos os tempos.'),
('É Assim que Acaba', 'Colleen Hoover', 'https://covers.openlibrary.org/b/isbn/9781501110368-L.jpg?default=false', 384, 'Uma história sobre amor, coragem e escolhas difíceis.'),
('Dom Casmurro', 'Machado de Assis', 'https://covers.openlibrary.org/b/isbn/9780195103083-L.jpg?default=false', 256, 'Bentinho, Capitu e a dúvida mais famosa da literatura brasileira.'),
('A Hora da Estrela', 'Clarice Lispector', 'https://covers.openlibrary.org/b/isbn/9780811219495-L.jpg?default=false', 96, 'A vida de Macabéa narrada por Rodrigo S.M.'),
('O Pequeno Príncipe', 'Antoine de Saint-Exupéry', 'https://covers.openlibrary.org/b/isbn/9780156012195-L.jpg?default=false', 96, 'Um piloto, um pequeno príncipe e uma rosa.'),
('Cem Anos de Solidão', 'Gabriel García Márquez', 'https://covers.openlibrary.org/b/isbn/9780060883287-L.jpg?default=false', 448, 'A saga da família Buendía em Macondo.'),
('Os Sete Maridos de Evelyn Hugo', 'Taylor Jenkins Reid', 'https://covers.openlibrary.org/b/isbn/9781501161933-L.jpg?default=false', 400, 'Uma estrela de Hollywood revela a verdade sobre sua vida.'),
('A Biblioteca da Meia-Noite', 'Matt Haig', 'https://covers.openlibrary.org/b/isbn/9780525559474-L.jpg?default=false', 304, 'Entre a vida e a morte existe uma biblioteca com infinitas possibilidades.'),
('1984', 'George Orwell', 'https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg?default=false', 336, 'O Grande Irmão está de olho em você.'),
('Jane Eyre', 'Charlotte Brontë', 'https://covers.openlibrary.org/b/isbn/9780141441146-L.jpg?default=false', 624, 'A órfã que se recusa a abrir mão de si mesma.'),
('O Hobbit', 'J.R.R. Tolkien', 'https://covers.openlibrary.org/b/isbn/9780547928227-L.jpg?default=false', 336, 'Bilbo Bolseiro parte em uma aventura inesperada.'),
('Torto Arado', 'Itamar Vieira Junior', NULL, 264, 'Duas irmãs e a terra no sertão da Bahia.');

-- POSTS
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '' CHECK (length(content) <= 3000),
  image_url text,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_created_idx ON public.posts (created_at DESC);
CREATE INDEX posts_user_idx ON public.posts (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own posts during setup" ON public.posts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own posts" ON public.posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own posts" ON public.posts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own posts" ON public.posts FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER posts_touch BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- POLLS
CREATE TABLE public.poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 100),
  position int NOT NULL DEFAULT 0
);
CREATE INDEX poll_options_post_idx ON public.poll_options (post_id);
GRANT SELECT, INSERT ON public.poll_options TO authenticated;
GRANT ALL ON public.poll_options TO service_role;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Poll options visible to post owners during setup" ON public.poll_options FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = auth.uid()));
CREATE POLICY "Post owner adds options" ON public.poll_options FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = auth.uid()));

CREATE TABLE public.poll_votes (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poll_votes TO authenticated;
GRANT ALL ON public.poll_votes TO service_role;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own votes during setup" ON public.poll_votes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users vote as themselves" ON public.poll_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users change own vote" ON public.poll_votes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users remove own vote" ON public.poll_votes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- LIKES
CREATE TABLE public.likes (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.likes TO authenticated;
GRANT ALL ON public.likes TO service_role;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own likes during setup" ON public.likes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users like as themselves" ON public.likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users unlike own" ON public.likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- SAVES (private)
CREATE TABLE public.saves (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.saves TO authenticated;
GRANT ALL ON public.saves TO service_role;
ALTER TABLE public.saves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own saves" ON public.saves FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users save as themselves" ON public.saves FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users unsave own" ON public.saves FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- COMMENTS
CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_post_idx ON public.comments (post_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own comments during setup" ON public.comments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users comment as themselves" ON public.comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own comments" ON public.comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- FOLLOWS
CREATE TABLE public.follows (
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX follows_following_idx ON public.follows (following_id);
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT ALL ON public.follows TO service_role;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own follow links during setup" ON public.follows FOR SELECT TO authenticated USING (auth.uid() = follower_id);
CREATE POLICY "Users follow as themselves" ON public.follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users unfollow own" ON public.follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- SHELF
CREATE TABLE public.shelf_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'want' CHECK (status IN ('want', 'reading', 'read')),
  current_page int NOT NULL DEFAULT 0 CHECK (current_page >= 0),
  rating smallint CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  review text NOT NULL DEFAULT '' CHECK (length(review) <= 3000),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);
CREATE INDEX shelf_user_idx ON public.shelf_items (user_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shelf_items TO authenticated;
GRANT ALL ON public.shelf_items TO service_role;
ALTER TABLE public.shelf_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own shelf during setup" ON public.shelf_items FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users add to own shelf" ON public.shelf_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own shelf" ON public.shelf_items FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users remove from own shelf" ON public.shelf_items FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.shelf_status_dates()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'reading' AND NEW.started_at IS NULL THEN NEW.started_at := now(); END IF;
  IF NEW.status = 'read' THEN
    IF NEW.finished_at IS NULL THEN NEW.finished_at := now(); END IF;
    IF NEW.started_at IS NULL THEN NEW.started_at := NEW.finished_at; END IF;
  ELSE
    NEW.finished_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER shelf_dates BEFORE INSERT OR UPDATE ON public.shelf_items FOR EACH ROW EXECUTE FUNCTION public.shelf_status_dates();

-- READING GOALS (private)
CREATE TABLE public.reading_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Minha meta de leitura' CHECK (length(title) BETWEEN 1 AND 100),
  target_books int NOT NULL CHECK (target_books BETWEEN 1 AND 1000),
  start_date date NOT NULL DEFAULT current_date,
  deadline date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (deadline >= start_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_goals TO authenticated;
GRANT ALL ON public.reading_goals TO service_role;
ALTER TABLE public.reading_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own goals" ON public.reading_goals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own goals" ON public.reading_goals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own goals" ON public.reading_goals FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own goals" ON public.reading_goals FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER goals_touch BEFORE UPDATE ON public.reading_goals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- MESSAGES
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);
CREATE INDEX messages_pair_idx ON public.messages (sender_id, recipient_id, created_at);
CREATE INDEX messages_recipient_idx ON public.messages (recipient_id, created_at);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read messages" ON public.messages FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "Users send as themselves" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Recipient marks read" ON public.messages FOR UPDATE TO authenticated USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'message')),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid;
BEGIN
  SELECT user_id INTO owner FROM public.posts WHERE id = NEW.post_id;
  IF owner IS NOT NULL AND owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id) VALUES (owner, NEW.user_id, 'like', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER likes_notify AFTER INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();

CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid;
BEGIN
  SELECT user_id INTO owner FROM public.posts WHERE id = NEW.post_id;
  IF owner IS NOT NULL AND owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id) VALUES (owner, NEW.user_id, 'comment', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER comments_notify AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, actor_id, type) VALUES (NEW.following_id, NEW.follower_id, 'follow');
  RETURN NEW;
END;
$$;
CREATE TRIGGER follows_notify AFTER INSERT ON public.follows FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, actor_id, type) VALUES (NEW.recipient_id, NEW.sender_id, 'message');
  RETURN NEW;
END;
$$;
CREATE TRIGGER messages_notify AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.notify_on_message();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_like() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_comment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_follow() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_message() FROM PUBLIC, anon, authenticated;

-- HELPER QUERIES
CREATE OR REPLACE FUNCTION public.suggested_readers(_limit int DEFAULT 5)
RETURNS TABLE (id uuid, username text, display_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.id <> auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.following_id = p.id)
  ORDER BY p.created_at DESC
  LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.trending_books(_limit int DEFAULT 5)
RETURNS TABLE (id uuid, title text, author text, cover_url text, readers bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT b.id, b.title, b.author, b.cover_url,
         (SELECT count(*) FROM public.shelf_items s WHERE s.book_id = b.id)
         + (SELECT count(*) FROM public.posts po WHERE po.book_id = b.id) AS readers
  FROM public.books b
  ORDER BY readers DESC, b.created_at ASC
  LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.my_conversations()
RETURNS TABLE (other_id uuid, last_content text, last_at timestamptz, last_from_me boolean, unread bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH m AS (
    SELECT CASE WHEN sender_id = auth.uid() THEN recipient_id ELSE sender_id END AS other_id,
           content, created_at, sender_id = auth.uid() AS from_me,
           (recipient_id = auth.uid() AND read_at IS NULL) AS is_unread
    FROM public.messages
    WHERE sender_id = auth.uid() OR recipient_id = auth.uid()
  )
  SELECT DISTINCT ON (m.other_id) m.other_id, m.content, m.created_at, m.from_me,
         (SELECT count(*) FROM m m2 WHERE m2.other_id = m.other_id AND m2.is_unread)
  FROM m
  ORDER BY m.other_id, m.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.suggested_readers(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trending_books(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_conversations() TO authenticated;

-- REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- STORAGE POLICIES (bucket "media")
CREATE POLICY "Users upload to own media folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own media" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
