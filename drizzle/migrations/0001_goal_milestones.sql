
ALTER TABLE public.reading_goals
  ADD COLUMN notify_25 boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_50 boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_75 boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_100 boolean NOT NULL DEFAULT true;

CREATE TABLE public.goal_milestones (
  goal_id uuid NOT NULL REFERENCES public.reading_goals(id) ON DELETE CASCADE,
  milestone int NOT NULL CHECK (milestone IN (25, 50, 75, 100)),
  reached_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (goal_id, milestone)
);
GRANT SELECT ON public.goal_milestones TO authenticated;
GRANT ALL ON public.goal_milestones TO service_role;
ALTER TABLE public.goal_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners see goal milestones" ON public.goal_milestones FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reading_goals g WHERE g.id = goal_id AND g.user_id = auth.uid()));

ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'comment', 'follow', 'message', 'goal'));
ALTER TABLE public.notifications
  ADD COLUMN goal_id uuid REFERENCES public.reading_goals(id) ON DELETE CASCADE,
  ADD COLUMN milestone int;

CREATE OR REPLACE FUNCTION public.check_goal_milestones(_goal_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g public.reading_goals%ROWTYPE;
  done int;
  m int;
  enabled boolean;
BEGIN
  SELECT * INTO g FROM public.reading_goals WHERE id = _goal_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT count(*) INTO done FROM public.shelf_items s
  WHERE s.user_id = g.user_id AND s.status = 'read' AND s.finished_at::date >= g.start_date;

  FOREACH m IN ARRAY ARRAY[25, 50, 75, 100] LOOP
    IF done * 100 >= g.target_books * m THEN
      IF NOT EXISTS (SELECT 1 FROM public.goal_milestones WHERE goal_id = g.id AND milestone = m) THEN
        INSERT INTO public.goal_milestones (goal_id, milestone) VALUES (g.id, m);
        enabled := CASE m WHEN 25 THEN g.notify_25 WHEN 50 THEN g.notify_50 WHEN 75 THEN g.notify_75 ELSE g.notify_100 END;
        IF enabled THEN
          INSERT INTO public.notifications (user_id, actor_id, type, goal_id, milestone)
          VALUES (g.user_id, g.user_id, 'goal', g.id, m);
        END IF;
      END IF;
    ELSE
      DELETE FROM public.goal_milestones WHERE goal_id = g.id AND milestone = m;
    END IF;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_goal_milestones(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.goal_milestones_after_shelf()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE gid uuid; uid uuid;
BEGIN
  uid := coalesce(NEW.user_id, OLD.user_id);
  FOR gid IN SELECT id FROM public.reading_goals WHERE user_id = uid LOOP
    PERFORM public.check_goal_milestones(gid);
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.goal_milestones_after_shelf() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER shelf_goal_milestones AFTER INSERT OR UPDATE OF status, finished_at OR DELETE ON public.shelf_items
  FOR EACH ROW EXECUTE FUNCTION public.goal_milestones_after_shelf();

CREATE OR REPLACE FUNCTION public.goal_milestones_after_goal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.check_goal_milestones(NEW.id);
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.goal_milestones_after_goal() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER goal_check_milestones AFTER INSERT OR UPDATE OF target_books, start_date ON public.reading_goals
  FOR EACH ROW EXECUTE FUNCTION public.goal_milestones_after_goal();
