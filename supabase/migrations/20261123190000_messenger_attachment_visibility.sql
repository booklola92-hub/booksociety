-- Allow chat participants to read only the media files attached to their own conversations.
-- Uploads remain in the private media bucket and are scoped to the sender/recipient pair.
begin;

drop policy if exists "Chat participants view message attachments" on storage.objects;
create policy "Chat participants view message attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'media'
  and (storage.foldername(name))[2] = 'messages'
  and exists (
    select 1
    from public.messages m
    where (
      (m.sender_id::text = (storage.foldername(name))[1]
        and m.recipient_id::text = (storage.foldername(name))[3]
        and m.recipient_id = auth.uid())
      or
      (m.recipient_id::text = (storage.foldername(name))[1]
        and m.sender_id::text = (storage.foldername(name))[3]
        and m.sender_id = auth.uid())
    )
    and (left(m.content, length('[PHOTO]' || name)) = '[PHOTO]' || name
      or left(m.content, length('[FILE]' || name || '|')) = '[FILE]' || name || '|')
  )
);

commit;