drop policy if exists "Readers see media attached to visible posts" on storage.objects;
create policy "Readers see media attached to visible posts" on storage.objects
for select to authenticated
using (
  bucket_id = 'media'
  and exists (
    select 1
    from public.posts p
    where p.image_url = storage.objects.name
      and (p.community_id is null or public.can_view_community(p.community_id, auth.uid()))
  )
);