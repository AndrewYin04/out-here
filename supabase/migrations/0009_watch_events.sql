-- Watch history: which seeded video (by key, see src/shared/seed/videos.json) a person watched
-- and for how long. Muse reads it to pick Marketplace items that match what someone watches.
-- RLS on with no policies, like every other table: route handlers use the server key.
create table if not exists public.watch_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  video_key  text not null check (char_length(video_key) <= 60),
  seconds    integer not null check (seconds between 1 and 3600),
  created_at timestamptz not null default now()
);
create index if not exists watch_events_user_idx on public.watch_events (user_id, created_at desc);
alter table public.watch_events enable row level security;
