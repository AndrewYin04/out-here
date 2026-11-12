-- Muse Intros (Boardy-style warm intros, vetted by two "Click" agents).
-- See MVP-BUILD-PLAN-itr-1.md "Muse Intros" and docs/HANDOFF.md "Click".
-- Visibility is enforced in route handlers: a person reads only intros where they are a or b, and
-- only their own side's agent log. RLS is on with no policies, like every other table.

create table public.intro_profiles (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  -- {friendship: {on, lookingFor}, networking: {on, lookingFor}, dating: {on, lookingFor}}
  kinds        jsonb not null default '{}'::jsonb,
  -- {ageMin, ageMax, genders: ["man"|"woman"|"nonbinary"]} or null
  dating_prefs jsonb,
  max_km       integer not null default 25 check (max_km between 1 and 500),
  paused       boolean not null default false
);

create table public.intros (
  id           uuid primary key,
  kind         text not null check (kind in ('friendship', 'networking', 'dating')),
  source       text not null default 'auto' check (source in ('auto', 'request')),
  a_id         uuid not null references public.profiles(id) on delete cascade,
  b_id         uuid not null references public.profiles(id) on delete cascade,
  trust_path   jsonb not null,          -- {mutualIds, groupIds, label}
  score        integer not null check (score between 0 and 100),
  reasons      jsonb not null,          -- string[]
  summary      text not null,
  note_a       text not null,
  note_b       text not null,
  first_step   jsonb not null,          -- {text, questId, placeId}
  agent_log_a  jsonb not null default '[]'::jsonb,   -- shown only to a
  agent_log_b  jsonb not null default '[]'::jsonb,   -- shown only to b
  status       text not null default 'proposed'
               check (status in ('proposed', 'a_accepted', 'b_accepted', 'accepted', 'declined', 'expired')),
  declined_by  uuid references public.profiles(id) on delete set null,
  thread_id    uuid references public.threads(id) on delete set null,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  check (a_id <> b_id)
);

create index intros_a_idx on public.intros (a_id, created_at desc);
create index intros_b_idx on public.intros (b_id, created_at desc);

alter table public.intro_profiles enable row level security;
alter table public.intros enable row level security;
