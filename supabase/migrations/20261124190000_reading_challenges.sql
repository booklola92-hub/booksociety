begin;

create table if not exists public.reading_challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  goal_books integer not null check (goal_books between 1 and 100),
  end_date date not null check (end_date >= current_date),
  created_at timestamptz not null default now()
);

create index if not exists reading_challenges_created_idx
  on public.reading_challenges (created_at desc);
create index if not exists reading_challenges_owner_idx
  on public.reading_challenges (owner_id, created_at desc);

grant select, insert, delete on public.reading_challenges to authenticated;
grant all on public.reading_challenges to service_role;

alter table public.reading_challenges enable row level security;

drop policy if exists "Authenticated readers view challenges" on public.reading_challenges;
create policy "Authenticated readers view challenges"
  on public.reading_challenges for select to authenticated
  using (true);

drop policy if exists "Readers create their own challenges" on public.reading_challenges;
create policy "Readers create their own challenges"
  on public.reading_challenges for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Owners delete their own challenges" on public.reading_challenges;
create policy "Owners delete their own challenges"
  on public.reading_challenges for delete to authenticated
  using (owner_id = auth.uid());

commit;
