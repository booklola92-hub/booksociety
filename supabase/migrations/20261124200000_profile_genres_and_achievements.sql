-- Preferências literárias públicas e conquistas desbloqueadas por usuário.
create table if not exists public.profile_genres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  genre text not null check (char_length(genre) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (user_id, genre)
);

alter table public.profile_genres enable row level security;
drop policy if exists "Profile genres are visible" on public.profile_genres;
create policy "Profile genres are visible" on public.profile_genres
  for select to authenticated using (true);
drop policy if exists "Users manage own profile genres" on public.profile_genres;
create policy "Users manage own profile genres" on public.profile_genres
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.profile_genres to authenticated;

create table if not exists public.profile_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null,
  title text not null,
  description text not null default '',
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_key)
);

alter table public.profile_achievements enable row level security;
drop policy if exists "Unlocked achievements are visible" on public.profile_achievements;
create policy "Unlocked achievements are visible" on public.profile_achievements
  for select to authenticated using (true);

grant select on public.profile_achievements to authenticated;
