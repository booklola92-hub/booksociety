-- Prevent books referenced by private-community posts from leaking through shelf access.
-- Keep public catalog books, the creator's own books, and books linked to public
-- posts or communities the current user belongs to visible.
begin;

drop policy if exists "Books visible in context" on public.books;

create policy "Books visible in context" on public.books
for select
using (
  created_by is null
  or created_by = auth.uid()
  or (
    exists (
      select 1
      from public.shelf_items s
      where s.book_id = books.id
        and s.user_id = auth.uid()
    )
    and not exists (
      select 1
      from public.posts p
      where p.book_id = books.id
        and p.community_id is not null
        and not exists (
          select 1
          from public.community_members cm
          where cm.community_id = p.community_id
            and cm.user_id = auth.uid()
        )
    )
  )
  or exists (
    select 1
    from public.posts p
    where p.book_id = books.id
      and (
        p.community_id is null
        or exists (
          select 1
          from public.community_members cm
          where cm.community_id = p.community_id
            and cm.user_id = auth.uid()
        )
      )
  )
);

commit;
