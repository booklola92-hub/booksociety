-- Restrict community settings to the owner and provide a guarded delete RPC.
begin;

drop policy if exists "Owner and admins update communities" on public.communities;
drop policy if exists "Creators update communities" on public.communities;
create policy "Only owner updates community" on public.communities
for update to authenticated
using (
  created_by = auth.uid()
  and public.community_role(id, auth.uid()) = 'owner'
)
with check (
  created_by = auth.uid()
  and public.community_role(id, auth.uid()) = 'owner'
);

create or replace function public.guard_community_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from old.created_by
     or public.community_role(old.id, auth.uid()) is distinct from 'owner' then
    raise exception 'Somente o dono pode editar esta comunidade.';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'O dono da comunidade não pode ser alterado.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.delete_community(_community uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not exists (
       select 1
       from public.communities c
       where c.id = _community
         and c.created_by = auth.uid()
         and public.community_role(c.id, auth.uid()) = 'owner'
     ) then
    raise exception 'Somente o dono pode excluir esta comunidade.';
  end if;

  delete from public.communities where id = _community;
end;
$$;

revoke all on function public.delete_community(uuid) from public, anon;
grant execute on function public.delete_community(uuid) to authenticated;

commit;
