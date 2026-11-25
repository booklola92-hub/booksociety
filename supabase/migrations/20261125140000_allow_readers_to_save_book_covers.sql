-- Allow readers to save only cover URLs for books already present on their own shelf.
-- The column-level grant prevents changing titles, authors, ownership, or other book data.
begin;

grant update (cover_url) on public.books to authenticated;

drop policy if exists "Readers update covers on own shelf" on public.books;
create policy "Readers update covers on own shelf"
on public.books
for update
to authenticated
using (
  exists (
    select 1
    from public.shelf_items s
    where s.book_id = books.id
      and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.shelf_items s
    where s.book_id = books.id
      and s.user_id = auth.uid()
  )
);

commit;
