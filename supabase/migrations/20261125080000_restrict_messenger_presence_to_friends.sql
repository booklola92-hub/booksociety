-- Restrict listening activity and messenger presence to accepted friends.
-- Following an account alone must never grant access to its Spotify/listening status.
begin;

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
      select 1
      from public.friend_requests r
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
  on public.messenger_presence
  for select
  to authenticated
  using (public.can_view_messenger_presence(user_id));

commit;
