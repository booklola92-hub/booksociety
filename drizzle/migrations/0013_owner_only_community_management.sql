-- NOTE: this file is not registered in meta/_journal.json, so the migrator never runs it.
-- Its rules are applied by 0013_privacy_media_and_community_authority.sql. Kept for history only.
-- Community settings and deletion are owner-only, enforced by the database.
DROP POLICY IF EXISTS "Owner and admins update communities" ON public.communities;
DROP POLICY IF EXISTS "Creators update communities" ON public.communities;
CREATE POLICY "Only owner updates community" ON public.communities
FOR UPDATE TO authenticated
USING (created_by = auth.uid() AND public.community_role(id, auth.uid()) = 'owner')
WITH CHECK (created_by = auth.uid() AND public.community_role(id, auth.uid()) = 'owner');

CREATE OR REPLACE FUNCTION public.guard_community_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM OLD.created_by
     OR public.community_role(OLD.id, auth.uid()) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Somente o dono pode editar esta comunidade.';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'O dono da comunidade não pode ser alterado.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.delete_community(_community uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.communities c
       WHERE c.id = _community
         AND c.created_by = auth.uid()
         AND public.community_role(c.id, auth.uid()) = 'owner'
     ) THEN
    RAISE EXCEPTION 'Somente o dono pode excluir esta comunidade.';
  END IF;

  DELETE FROM public.communities WHERE id = _community;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_community(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_community(uuid) TO authenticated;
