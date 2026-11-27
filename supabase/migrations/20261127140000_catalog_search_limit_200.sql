begin;

-- Allow the internal catalog RPC to return the full 200-item page requested by the UI.
create or replace function public.search_catalog(
  _q text default '',
  _qn text default '',
  _category text default 'todos',
  _limit integer default 200,
  _offset integer default 0
)
returns table(
  id uuid, origin text, title text, authors text[], cover_url text, synopsis text,
  kind text, is_bl boolean, alt_titles text[]
)
language sql stable security definer set search_path = public, extensions as $$
  with params as (
    select trim(coalesce(_q, '')) q,
      public.catalog_norm(coalesce(nullif(trim(_qn, ''), ''), _q)) qn,
      public.catalog_compact(coalesce(nullif(trim(_qn, ''), ''), _q)) qc,
      coalesce(_category, 'todos') cat
  ),
  book_rows as (
    select b.id, 'book'::text origin, b.title,
      array_remove(array[nullif(b.author, '')], null) authors, b.cover_url,
      nullif(b.description, '') synopsis, 'livro'::text kind, false is_bl,
      '{}'::text[] alt_titles, b.created_at sort_at
    from public.books b, params p
    where p.cat in ('todos','livros')
      and (
        b.created_by = auth.uid()
        or (
          not exists (
            select 1 from public.posts private_post
            where private_post.book_id = b.id
              and private_post.community_id is not null
              and not public.can_view_community(private_post.community_id, auth.uid())
          )
          and (
            b.created_by is null
            or exists (select 1 from public.shelf_items s where s.book_id=b.id and s.user_id=auth.uid())
            or exists (select 1 from public.posts po where po.book_id=b.id
              and (po.community_id is null or public.can_view_community(po.community_id,auth.uid())))
          )
        )
      )
      and (p.qn = '' or b.title ilike '%'||p.q||'%' or b.author ilike '%'||p.q||'%'
        or public.catalog_norm(b.title) like '%'||p.qn||'%'
        or public.catalog_norm(b.author) like '%'||p.qn||'%'
        or public.catalog_compact(b.title) like '%'||p.qc||'%'
        or public.catalog_compact(b.author) like '%'||p.qc||'%')
  ),
  work_rows as (
    select w.id, 'work'::text origin, w.title, w.authors, w.cover_url, w.synopsis,
      w.kind, w.is_bl, w.alt_titles, w.created_at sort_at
    from public.works w, params p
    where case p.cat when 'livros' then w.kind='livro'
      when 'novels' then w.kind in ('novel','webnovel')
      when 'mangas' then w.kind='manga'
      when 'manhwas' then w.kind='manhwa'
      when 'bl' then w.is_bl
      else w.kind in ('livro','novel','webnovel','manga','manhwa') or w.is_bl end
      and (p.qn='' or w.title ilike '%'||p.q||'%'
        or coalesce(w.original_title,'') ilike '%'||p.q||'%'
        or array_to_string(w.alt_titles,' ') ilike '%'||p.q||'%'
        or array_to_string(w.authors,' ') ilike '%'||p.q||'%'
        or public.catalog_norm(w.title||' '||coalesce(w.original_title,'')||' '||array_to_string(w.alt_titles,' ')) like '%'||p.qn||'%'
        or public.catalog_norm(array_to_string(w.authors,' ')) like '%'||p.qn||'%'
        or public.catalog_compact(w.title||' '||coalesce(w.original_title,'')||' '||array_to_string(w.alt_titles,' ')) like '%'||p.qc||'%'
        or public.catalog_compact(array_to_string(w.authors,' ')) like '%'||p.qc||'%')
  )
  select r.id,r.origin,r.title,r.authors,r.cover_url,left(r.synopsis,400),r.kind,r.is_bl,r.alt_titles
  from (select * from book_rows union all select * from work_rows) r
  where auth.uid() is not null
  order by lower(r.title),r.sort_at
  limit least(greatest(coalesce(_limit,200),1),200)
  offset greatest(coalesce(_offset,0),0);
$$;

revoke all on function public.search_catalog(text,text,text,integer,integer) from public, anon;
grant execute on function public.search_catalog(text,text,text,integer,integer) to authenticated;

commit;
