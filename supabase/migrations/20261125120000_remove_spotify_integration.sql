-- Remove Spotify listening integration while keeping ordinary messenger status/presence.
alter table public.messenger_presence
  drop column if exists spotify_track_name,
  drop column if exists spotify_artist,
  drop column if exists spotify_album_image,
  drop column if exists spotify_url,
  drop column if exists spotify_is_playing;
