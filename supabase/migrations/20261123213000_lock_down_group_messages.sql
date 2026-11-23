begin;

-- Membership helper is scoped to the caller to prevent role/membership probing.
create or replace function public.is_messenger_group_member(_group uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $
  select auth.uid() is not null and _user = auth.uid() and exists (
    select 1 from public.messenger_group_members m
    where m.group_id = _group and m.user_id = auth.uid()
  )
$;
revoke all on function public.is_messenger_group_member(uuid,uuid) from public, anon;
grant execute on function public.is_messenger_group_member(uuid,uuid) to authenticated;

-- Restrict group messages to current group members and prevent arbitrary edits/deletes.
alter table public.messenger_group_messages enable row level security;
revoke all on table public.messenger_group_messages from anon, authenticated;
grant select, insert on table public.messenger_group_messages to authenticated;

drop policy if exists "Members read group messages" on public.messenger_group_messages;
create policy "Members read group messages" on public.messenger_group_messages
for select to authenticated
using (public.is_messenger_group_member(group_id, auth.uid()));

drop policy if exists "Members send group messages" on public.messenger_group_messages;
create policy "Members send group messages" on public.messenger_group_messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and public.is_messenger_group_member(group_id, auth.uid())
);

-- No UPDATE or DELETE policy is intentionally created: messages are immutable
-- for client users; service-role moderation remains available.

commit;
