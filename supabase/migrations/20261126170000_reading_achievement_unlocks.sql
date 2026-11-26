-- Desbloqueia medalhas reais conforme a quantidade de livros concluídos.
-- As conquistas são gravadas uma única vez por usuário e permanecem no histórico.

CREATE OR REPLACE FUNCTION public.unlock_reading_achievements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  completed_count integer;
BEGIN
  IF NEW.status <> 'read' THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::integer
    INTO completed_count
  FROM public.shelf_items
  WHERE user_id = NEW.user_id
    AND status = 'read';

  INSERT INTO public.profile_achievements
    (user_id, achievement_key, title, description)
  SELECT
    NEW.user_id,
    milestone.achievement_key,
    milestone.title,
    milestone.description
  FROM (VALUES
    (1,   'books_read_1',   'Primeiro capítulo', 'Você concluiu seu primeiro livro!'),
    (5,   'books_read_5',   'Leitor dedicado', 'Você já concluiu 5 livros. Continue assim!'),
    (10,  'books_read_10',  'Dez histórias', 'Dez livros concluídos e muitas histórias vividas.'),
    (25,  'books_read_25',  'Explorador literário', 'Você chegou a 25 livros concluídos.'),
    (50,  'books_read_50',  'Apaixonado por leitura', 'Você concluiu 50 livros!'),
    (100, 'books_read_100', 'Lenda literária', 'Uma marca incrível: 100 livros concluídos!')
  ) AS milestone(required_count, achievement_key, title, description)
  WHERE completed_count >= milestone.required_count
  ON CONFLICT (user_id, achievement_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shelf_unlock_reading_achievements ON public.shelf_items;
CREATE TRIGGER shelf_unlock_reading_achievements
AFTER INSERT OR UPDATE OF status, finished_at
ON public.shelf_items
FOR EACH ROW
EXECUTE FUNCTION public.unlock_reading_achievements();

REVOKE EXECUTE ON FUNCTION public.unlock_reading_achievements() FROM PUBLIC, anon, authenticated;

-- Reconhece também os livros que já estavam marcados como lidos antes desta atualização.
WITH completed AS (
  SELECT user_id, count(*)::integer AS total
  FROM public.shelf_items
  WHERE status = 'read'
  GROUP BY user_id
)
INSERT INTO public.profile_achievements
  (user_id, achievement_key, title, description)
SELECT
  completed.user_id,
  milestone.achievement_key,
  milestone.title,
  milestone.description
FROM completed
CROSS JOIN (VALUES
  (1,   'books_read_1',   'Primeiro capítulo', 'Você concluiu seu primeiro livro!'),
  (5,   'books_read_5',   'Leitor dedicado', 'Você já concluiu 5 livros. Continue assim!'),
  (10,  'books_read_10',  'Dez histórias', 'Dez livros concluídos e muitas histórias vividas.'),
  (25,  'books_read_25',  'Explorador literário', 'Você chegou a 25 livros concluídos.'),
  (50,  'books_read_50',  'Apaixonado por leitura', 'Você concluiu 50 livros!'),
  (100, 'books_read_100', 'Lenda literária', 'Uma marca incrível: 100 livros concluídos!')
) AS milestone(required_count, achievement_key, title, description)
WHERE completed.total >= milestone.required_count
ON CONFLICT (user_id, achievement_key) DO NOTHING;
