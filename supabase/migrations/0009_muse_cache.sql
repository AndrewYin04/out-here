-- Pre-baked Muse answers (docs/MUSE_PREBAKE.md) and the columns muse_runs needs to tell a live
-- call from a stored answer.
--
-- Why a separate table instead of reading muse_runs: muse_runs is the append-only log (the Q&A
-- evidence). One ask has many rows there (live calls, failures, mock runs, cache hits), so a
-- lookup would have to pick "the newest ok, live, non-mock row per key" on every Muse call.
-- muse_cache holds exactly one answer per (route, model, input_hash), primary-key lookup, and a
-- refresh overwrites it, while the log keeps every row. Each cache row points at the muse_runs
-- row of the live call that produced it (source_run_id), and each cache hit is logged in
-- muse_runs with cached = true, prebaked = true and cache_run_id = that same id.
--
-- RLS is on with no policies, like every other table: only the server (secret key) reads it.
-- Re-seeding never touches either table.

alter table public.muse_runs add column if not exists schema_name  text;
alter table public.muse_runs add column if not exists mock         boolean not null default false;
alter table public.muse_runs add column if not exists cached       boolean not null default false;
alter table public.muse_runs add column if not exists prebaked     boolean not null default false;
alter table public.muse_runs add column if not exists cache_run_id uuid;
create index if not exists muse_runs_user_created_idx on public.muse_runs (user_id, created_at desc);

create table if not exists public.muse_cache (
  route             text not null,
  model             text not null,
  input_hash        text not null,
  schema_name       text not null default '',
  output            jsonb not null,
  prompt_tokens     integer,
  completion_tokens integer,
  latency_ms        integer not null default 0,
  source_run_id     uuid,
  created_at        timestamptz not null default now(),
  primary key (route, model, input_hash)
);

alter table public.muse_cache enable row level security;
