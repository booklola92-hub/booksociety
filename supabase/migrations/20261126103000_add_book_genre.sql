-- Store the literary genre with the shared book catalog entry.
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS genre text NOT NULL DEFAULT '';
