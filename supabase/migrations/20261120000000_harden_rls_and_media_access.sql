-- Harden row-level security for social data and private media.
-- Applied to the live Supabase database; this migration records the same changes
-- so future environments can reproduce the security posture.

begin;

drop policy if exists "Books visible to signed-in readers" on public.books;
create policy "Books visible to signed-in readers" on public.books
for select to authenticated using (auth.uid() is not null);

drop policy if exists "Comments visible" on public.comments;
create policy "Comments visible" on public.comments
for select to authenticated using (
  auth.uid() is not null and exists (
    select 1 from public.posts p
    where p.id = comments.post_id
      and (p.community_id is null or exists (
        select 1 from public.community_members cm
        where cm.community_id = p.community_id and cm.user_id = auth.uid()
      ))
  )
);

drop policy if exists "Communities visible to signed-in readers" on public.communities;
create policy "Communities visible to signed-in readers" on public.communities
for select to authenticated using (auth.uid() is not null);

drop policy if exists "Members visible" on public.community_members;
create policy "Members visible" on public.community_members
for select to authenticated using (auth.uid() is not null);

drop policy if exists "Follows visible" on public.follows;
create policy "Follows visible" on public.follows
for select to authenticated using (auth.uid() is not null);

drop policy if exists "Likes visible" on public.likes;
create policy "Likes visible" on public.likes
for select to authenticated using (
  auth.uid() is not null and exists (
    select 1 from public.posts p
    where p.id = likes.post_id
      and (p.community_id is null or exists (
        select 1 from public.community_members cm
        where cm.community_id = p.community_id and cm.user_id = auth.uid()
      ))
  )
);

drop policy if exists "Poll options visible" on public.poll_options;
create policy "Poll options visible" on public.poll_options
for select to authenticated using (
  auth.uid() is not null and exists (
    select 1 from public.posts p
    where p.id = poll_options.post_id
      and (p.community_id is null or exists (
        select 1 from public.community_members cm
        where cm.community_id = p.community_id and cm.user_id = auth.uid()
      ))
  )
);

drop policy if exists "Votes visible" on public.poll_votes;
create policy "Votes visible" on public.poll_votes
for select to authenticated using (
  auth.uid() is not null and exists (
    select 1 from public.posts p
    where p.id = poll_votes.post_id
      and (p.community_id is null or exists (
        select 1 from public.community_members cm
        where cm.community_id = p.community_id and cm.user_id = auth.uid()
      ))
  )
);

drop policy if exists "Posts visible to signed-in readers" on public.posts;
create policy "Posts visible to signed-in readers" on public.posts
for select to authenticated using (
  auth.uid() is not null and (
    community_id is null or exists (
      select 1 from public.community_members cm
      where cm.community_id = posts.community_id and cm.user_id = auth.uid()
    )
  )
);

drop policy if exists "Profiles visible to signed-in readers" on public.profiles;
create policy "Profiles visible to signed-in readers" on public.profiles
for select to authenticated using (auth.uid() is not null);

drop policy if exists "Shelves visible" on public.shelf_items;
create policy "Shelves visible" on public.shelf_items
for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Signed-in readers view media" on storage.objects;
create policy "Users view own media" on storage.objects
for select to authenticated using (
  bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users update own media" on storage.objects;
create policy "Users update own media" on storage.objects
for update to authenticated
using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
