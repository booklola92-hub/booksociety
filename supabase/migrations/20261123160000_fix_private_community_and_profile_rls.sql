-- Close the private-community and profile exposure findings.
-- Existing permissive SELECT policies are removed first because PostgreSQL
-- combines permissive policies with OR.
begin;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename in ('profiles','communities','community_members')
      and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname,
      case when p.tablename is null then 'profiles' else p.tablename end);
  end loop;
end $$;

-- Profiles are only directly readable by their owner. Public profile cards
-- must use the narrowly-projected search_public_profiles RPC, not table access.
create policy "Users read own profile only"
on public.profiles for select to authenticated
using (auth.uid() = id);

-- Public communities remain discoverable. Private community metadata is
-- visible only to its creator and current members.
create policy "Public communities or private community participants"
on public.communities for select to authenticated
using (
  is_private is false
  or created_by = auth.uid()
  or exists (
    select 1 from public.community_members cm
    where cm.community_id = communities.id
      and cm.user_id = auth.uid()
  )
);

-- For private groups, expose only the caller's own membership row (and thus
-- their own role). Membership rows in public groups remain visible.
create policy "Own membership or public group membership"
on public.community_members for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.communities c
    where c.id = community_members.community_id
      and c.is_private is false
  )
);

-- Remove the broad legacy media read policy. Retain own-file access and
-- access to media attached to posts the caller is allowed to view.
drop policy if exists "Users view own media" on storage.objects;
drop policy if exists "Readers see media attached to visible posts" on storage.objects;
create policy "Owners or readers of visible post media"
on storage.objects for select to authenticated
using (
  bucket_id = 'media'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.posts p
      where p.image_url = storage.objects.name
        and (
          p.community_id is null
          or public.can_view_community(p.community_id, auth.uid())
        )
    )
  )
);

commit;
