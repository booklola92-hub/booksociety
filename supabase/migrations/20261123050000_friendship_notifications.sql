-- Expand notification events and create notifications for friendship requests.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'comment', 'follow', 'message', 'friend_request', 'friend_accepted'));

CREATE OR REPLACE FUNCTION public.notify_on_friend_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, actor_id, type)
    VALUES (NEW.addressee_id, NEW.requester_id, 'friend_request');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friend_requests_notify ON public.friend_requests;
CREATE TRIGGER friend_requests_notify
AFTER INSERT ON public.friend_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_on_friend_request();

CREATE OR REPLACE FUNCTION public.notify_on_friend_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    INSERT INTO public.notifications (user_id, actor_id, type)
    VALUES (NEW.requester_id, NEW.addressee_id, 'friend_accepted');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friend_requests_accepted_notify ON public.friend_requests;
CREATE TRIGGER friend_requests_accepted_notify
AFTER UPDATE OF status ON public.friend_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_on_friend_accepted();

REVOKE EXECUTE ON FUNCTION public.notify_on_friend_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_friend_accepted() FROM PUBLIC, anon, authenticated;