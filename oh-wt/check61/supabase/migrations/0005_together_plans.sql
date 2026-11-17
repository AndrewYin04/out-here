-- Plan together: one shared, Muse-proposed plan for friends who are free at the same time.
-- Everyone sees the same options and taps "I'm in"; it locks when every member is in on one
-- option. member_key (sorted member ids) + the partial unique index keep exactly one open plan
-- per group, so two people opening it at the same moment get the same plan.
create table if not exists public.together_plans (
  id                 uuid primary key default gen_random_uuid(),
  member_key         text not null,
  member_ids         uuid[] not null,
  started_by         uuid not null references public.profiles(id) on delete cascade,
  options            jsonb not null default '[]',
  votes              jsonb not null default '{}',
  status             text not null default 'proposing' check (status in ('proposing', 'confirmed', 'expired')),
  confirmed_quest_id uuid references public.quests(id) on delete set null,
  summary            text not null default '',
  expires_at         timestamptz not null,
  created_at         timestamptz not null default now()
);
create unique index if not exists together_plans_one_open
  on public.together_plans (member_key) where status = 'proposing';
create index if not exists together_plans_members_idx on public.together_plans using gin (member_ids);
alter table public.together_plans enable row level security;
-- No anon policies: the browser never reads tables; route handlers use the server key.
