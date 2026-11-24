begin;

create table if not exists public.gallery_albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  cover_path text,
  created_at timestamptz not null default now()
);
create index if not exists gallery_albums_owner_idx on public.gallery_albums (owner_id, created_at desc);

create table if not exists public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.gallery_albums(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null,
  caption text not null default '' check (char_length(caption) <= 240),
  created_at timestamptz not null default now()
);
create index if not exists gallery_photos_album_idx on public.gallery_photos (album_id, created_at desc);
create index if not exists gallery_photos_owner_idx on public.gallery_photos (owner_id, created_at desc);

grant select, insert, update, delete on public.gallery_albums to authenticated;
grant select, insert, update, delete on public.gallery_photos to authenticated;
grant all on public.gallery_albums, public.gallery_photos to service_role;

alter table public.gallery_albums enable row level security;
alter table public.gallery_photos enable row level security;

drop policy if exists "Owners manage their gallery albums" on public.gallery_albums;
create policy "Owners manage their gallery albums" on public.gallery_albums
for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "Owners manage their gallery photos" on public.gallery_photos;
create policy "Owners manage their gallery photos" on public.gallery_photos
for all to authenticated using (owner_id = auth.uid()) with check (
  owner_id = auth.uid()
  and exists (select 1 from public.gallery_albums a where a.id = album_id and a.owner_id = auth.uid())
);

commit;
