begin;

create table if not exists public.messenger_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status_text text not null default 'Sonhe, leia, converse...' check (char_length(status_text) <= 80),
  spotify_track_name text,
  spotify_artist text,
  spotify_album_image text,
  spotify_url text,
  spotify_is_playing boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.messenger_presence enable row level security;
grant select, insert, update, delete on public.messenger_presence to authenticated;

create or replace function public.can_view_messenger_presence(_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    auth.uid() = _owner
    or exists (
      select 1 from public.follows f
      where (f.follower_id = auth.uid() and f.following_id = _owner)
         or (f.follower_id = _owner and f.following_id = auth.uid())
    )
    or exists (
      select 1 from public.friend_requests r
      where r.status = 'accepted'
        and least(r.requester_id, r.addressee_id) = least(auth.uid(), _owner)
        and greatest(r.requester_id, r.addressee_id) = greatest(auth.uid(), _owner)
    )
  );
$$;
revoke all on function public.can_view_messenger_presence(uuid) from public, anon;
grant execute on function public.can_view_messenger_presence(uuid) to authenticated;

drop policy if exists "Readers see connected messenger presence" on public.messenger_presence;
create policy "Readers see connected messenger presence"
  on public.messenger_presence for select to authenticated
  using (public.can_view_messenger_presence(user_id));

drop policy if exists "Users create own messenger presence" on public.messenger_presence;
create policy "Users create own messenger presence"
  on public.messenger_presence for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update own messenger presence" on public.messenger_presence;
create policy "Users update own messenger presence"
  on public.messenger_presence for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own messenger presence" on public.messenger_presence;
create policy "Users delete own messenger presence"
  on public.messenger_presence for delete to authenticated
  using (auth.uid() = user_id);

create or replace function public.touch_messenger_presence()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists messenger_presence_touch on public.messenger_presence;
create trigger messenger_presence_touch before update on public.messenger_presence
for each row execute function public.touch_messenger_presence();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'messenger_presence'
     ) then
    alter publication supabase_realtime add table public.messenger_presence;
  end if;
end $$;

commit;
