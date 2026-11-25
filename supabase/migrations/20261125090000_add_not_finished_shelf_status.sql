-- Add the distinct "Não terminou" shelf status used by catalog additions.
ALTER TABLE public.shelf_items DROP CONSTRAINT IF EXISTS shelf_items_status_check;
ALTER TABLE public.shelf_items
  ADD CONSTRAINT shelf_items_status_check CHECK (status IN ('want', 'reading', 'read', 'not_finished'));
