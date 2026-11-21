-- Restrict follow relationship rows to the signed-in user's own outgoing follows.
-- This prevents reading other readers' follower/following lists and deriving private counts.
begin;
drop policy if exists "Users see own follow links" on public.follows;
drop policy if exists "Users see own follow links during setup" on public.follows;
create policy "Users see own follow links"
on public.follows
for select to authenticated
using (auth.uid() = follower_id);
commit;
