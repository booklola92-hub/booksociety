begin;

create table if not exists public.messenger_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Conversa em grupo',
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.messenger_group_members (
  group_id uuid not null references public.messenger_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.messenger_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.messenger_groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists messenger_group_messages_order_idx
  on public.messenger_group_messages(group_id, created_at);

alter table public.messenger_groups enable row level security;
alter table public.messenger_group_members enable row level security;
alter table public.messenger_group_messages enable row level security;

grant select on public.messenger_groups to authenticated;
grant select on public.messenger_group_members to authenticated;
grant select, insert on public.messenger_group_messages to authenticated;

create or replace function public.is_messenger_group_member(_group_id uuid, _user_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $
  select exists (
    select 1 from public.messenger_group_members m
    where m.group_id = _group_id and m.user_id = _user_id
  );
$;
revoke all on function public.is_messenger_group_member(uuid, uuid) from public;
grant execute on function public.is_messenger_group_member(uuid, uuid) to authenticated;

drop policy if exists "Members read their messenger groups" on public.messenger_groups;
create policy "Members read their messenger groups" on public.messenger_groups
  for select to authenticated using (public.is_messenger_group_member(id, auth.uid()));

drop policy if exists "Members read messenger group membership" on public.messenger_group_members;
create policy "Members read messenger group membership" on public.messenger_group_members
  for select to authenticated using (public.is_messenger_group_member(messenger_group_members.group_id, auth.uid()));

drop policy if exists "Members read group messages" on public.messenger_group_messages;
create policy "Members read group messages" on public.messenger_group_messages
  for select to authenticated using (
    exists (select 1 from public.messenger_group_members m where m.group_id = messenger_group_messages.group_id and m.user_id = auth.uid())
  );

drop policy if exists "Members send group messages" on public.messenger_group_messages;
create policy "Members send group messages" on public.messenger_group_messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and exists (select 1 from public.messenger_group_members m where m.group_id = messenger_group_messages.group_id and m.user_id = auth.uid())
  );

create or replace function public.create_messenger_group(_participant_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _group_id uuid;
  _count integer;
begin
  if _uid is null then raise exception 'É necessário entrar na conta.'; end if;
  if _participant_ids is null then raise exception 'Selecione pelo menos uma pessoa.'; end if;
  select count(distinct x) into _count from unnest(_participant_ids) x where x is not null and x <> _uid;
  if _count < 1 then raise exception 'Selecione pelo menos uma pessoa.'; end if;
  if _count > 5 then raise exception 'O grupo pode ter no máximo 6 participantes contando você.'; end if;
  if exists (
    select 1 from unnest(_participant_ids) x
    where x is not null and x <> _uid
      and not exists (select 1 from public.profiles p where p.id = x)
  ) then raise exception 'Uma pessoa selecionada não foi encontrada.'; end if;

  insert into public.messenger_groups(created_by) values (_uid) returning id into _group_id;
  insert into public.messenger_group_members(group_id, user_id)
    values (_group_id, _uid);
  insert into public.messenger_group_members(group_id, user_id)
    select _group_id, distinct_ids.x
    from (select distinct x from unnest(_participant_ids) x where x is not null and x <> _uid) distinct_ids;
  return _group_id;
end;
$$;

revoke all on function public.create_messenger_group(uuid[]) from public;
grant execute on function public.create_messenger_group(uuid[]) to authenticated;

commit;