drop policy if exists "Profiles visible to connected readers" on public.profiles;
drop policy if exists "Profiles visible to signed-in readers" on public.profiles;
drop policy if exists "Users see own profile" on public.profiles;
create policy "Profiles visible to signed-in readers"
on public.profiles
for select to authenticated
using (auth.uid() is not null);