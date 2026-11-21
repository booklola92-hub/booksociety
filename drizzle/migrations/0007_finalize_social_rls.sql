-- Final RLS tightening for social relationships and private communities.
-- Private community names/descriptions and membership lists are visible only to their members.
begin;

drop policy if exists "Follows visible" on public.follows;
drop policy if exists "Users see own follow links" on public.follows;
create policy "Users see own follow links" on public.follows
for select to authenticated
using (auth.uid() = follower_id or auth.uid() = following_id);

drop policy if exists "Members visible" on public.community_members;
drop policy if exists "Users see own memberships" on public.community_members;
create policy "Members see memberships in accessible communities" on public.community_members
for select to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.communities c
    where c.id = community_members.community_id
      and c.is_private = false
  )
  or exists (
    select 1 from public.community_members mine
    where mine.community_id = community_members.community_id
      and mine.user_id = auth.uid()
  )
);

drop policy if exists "Creators and members view communities" on public.communities;
drop policy if exists "Communities visible to signed-in readers" on public.communities;
create policy "Members and creators view private communities" on public.communities
for select to authenticated
using (
  is_private = false
  or created_by = auth.uid()
  or exists (
    select 1 from public.community_members cm
    where cm.community_id = communities.id and cm.user_id = auth.uid()
  )
);

commit;