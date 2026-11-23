begin;

-- Friendship requests are separate from following. Only the two people involved
-- can read or manage a relationship; no private profile data is exposed.
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_requests_not_self check (requester_id <> addressee_id)
);
create unique index if not exists friend_requests_pair_unique
  on public.friend_requests (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friend_requests_addressee_idx
  on public.friend_requests (addressee_id, status);

alter table public.friend_requests enable row level security;
grant select, insert, update, delete on public.friend_requests to authenticated;
drop policy if exists "Participants read friendship requests" on public.friend_requests;
create policy "Participants read friendship requests" on public.friend_requests
  for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
drop policy if exists "Users send friendship requests" on public.friend_requests;
create policy "Users send friendship requests" on public.friend_requests
  for insert to authenticated
  with check (auth.uid() = requester_id and status = 'pending' and requester_id <> addressee_id);
drop policy if exists "Recipients answer friendship requests" on public.friend_requests;
create policy "Recipients answer friendship requests" on public.friend_requests
  for update to authenticated
  using (auth.uid() = addressee_id and status = 'pending')
  with check (auth.uid() = addressee_id and status in ('accepted','rejected'));
drop policy if exists "Participants remove friendship requests" on public.friend_requests;
create policy "Participants remove friendship requests" on public.friend_requests
  for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Show public aggregate follower/following totals, without revealing follower identities.
create or replace function public.follow_stats(_user_id uuid)
returns table(followers bigint, following bigint, i_follow boolean)
language sql stable security definer set search_path = ''
as $$
  select
    (select count(*) from public.follows f where f.following_id = _user_id),
    (select count(*) from public.follows f where f.follower_id = _user_id),
    exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid() and f.following_id = _user_id
    )
  where auth.uid() is not null and _user_id is not null;
$$;
revoke all on function public.follow_stats(uuid) from public, anon;
grant execute on function public.follow_stats(uuid) to authenticated;

-- Public-community posts are visible to signed-in members of the site;
-- private-community posts, comments, reactions and polls remain member-only.
drop policy if exists "Posts visible to signed-in readers" on public.posts;
create policy "Posts visible to signed-in readers" on public.posts
  for select to authenticated
  using (auth.uid() is not null and (community_id is null or public.can_view_community(community_id, auth.uid())));

drop policy if exists "Comments visible" on public.comments;
create policy "Comments visible" on public.comments
  for select to authenticated
  using (auth.uid() is not null and exists (
    select 1 from public.posts p
    where p.id = comments.post_id
      and (p.community_id is null or public.can_view_community(p.community_id, auth.uid()))
  ));

drop policy if exists "Likes visible" on public.likes;
create policy "Likes visible" on public.likes
  for select to authenticated
  using (auth.uid() is not null and exists (
    select 1 from public.posts p
    where p.id = likes.post_id
      and (p.community_id is null or public.can_view_community(p.community_id, auth.uid()))
  ));

drop policy if exists "Poll options visible" on public.poll_options;
create policy "Poll options visible" on public.poll_options
  for select to authenticated
  using (auth.uid() is not null and exists (
    select 1 from public.posts p
    where p.id = poll_options.post_id
      and (p.community_id is null or public.can_view_community(p.community_id, auth.uid()))
  ));

drop policy if exists "Votes visible" on public.poll_votes;
create policy "Votes visible" on public.poll_votes
  for select to authenticated
  using (auth.uid() is not null and exists (
    select 1 from public.posts p
    where p.id = poll_votes.post_id
      and (p.community_id is null or public.can_view_community(p.community_id, auth.uid()))
  ));

commit;