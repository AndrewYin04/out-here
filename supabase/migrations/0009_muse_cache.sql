-- 0009: prebaked Muse (docs/MUSE_PREBAKE.md).
-- muse_cache keeps real Muse answers by (route, model, input_hash) so the demo's scripted asks,
-- warmed once after the morning reseed, are served in about 50 ms on stage. input_hash is the
-- stable key from src/features/muse/cache-key.ts (no clock, no live seat or walk figures).
-- muse_settings holds the prebaked switch the warm-up sets.
-- muse_runs gains the columns that say whether a row was served from the cache, and why.
-- RLS on with no policies, like every other table: only the server (secret key) reads these.

create table if not exists public.muse_cache (
  route        text not null,
  model        text not null,
  input_hash   text not null,
  schema_name  text not null,
  output       jsonb not null,          -- the zod-validated output of a live Muse call
  user_id      uuid,                    -- persona the answer was made for (also part of the key)
  latency_ms   integer not null default 0,  -- how long that live call took
  created_at   timestamptz not null default now(),
  primary key (route, model, input_hash)
);
create index if not exists muse_cache_created_idx on public.muse_cache (created_at desc);

create table if not exists public.muse_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.muse_runs add column if not exists schema_name  text;
alter table public.muse_runs add column if not exists cached       boolean not null default false;
alter table public.muse_runs add column if not exists mock         boolean not null default false;
alter table public.muse_runs add column if not exists cache_reason text;  -- prebaked | stage-timeout | live-failed

alter table public.muse_cache    enable row level security;
alter table public.muse_settings enable row level security;
