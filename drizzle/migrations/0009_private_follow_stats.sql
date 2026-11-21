-- Keep follow relationships private and prevent RPCs from exposing other readers' totals.
begin;

drop policy if exists "Follows visible" on public.follows;
drop policy if exists "Users see own follow links during setup" on public.follows;
drop policy if exists "Users see own follow links" on public.follows;
create policy "Users see own follow links"
on public.follows
for select to authenticated
using (auth.uid() = follower_id);

create or replace function public.follow_stats(_user_id uuid)
returns table(followers bigint, following bigint, i_follow boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when _user_id = auth.uid()
      then (select count(*) from public.follows f where f.following_id = auth.uid())
      else 0::bigint
    end,
    case when _user_id = auth.uid()
      then (select count(*) from public.follows f where f.follower_id = auth.uid())
      else 0::bigint
    end,
    exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid() and f.following_id = _user_id
    )
  where auth.uid() is not null;
$$;

revoke all on function public.follow_stats(uuid) from public, anon;
grant execute on function public.follow_stats(uuid) to authenticated;

create or replace function public.suggested_readers(_limit integer default 5)
returns table(id uuid, username text, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and not exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid() and f.following_id = p.id
    )
  order by p.created_at desc
  limit least(greatest(coalesce(_limit, 5), 1), 20);
$$;

revoke all on function public.suggested_readers(integer) from public, anon;
grant execute on function public.suggested_readers(integer) to authenticated;

commit;
