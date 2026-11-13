-- Daily Side Quests (docs/DAILY_SIDE_QUESTS.md).
--   * side_quest_drops: each person's randomized drop and deadline for a date, picked once on the
--     server and never rerolled (primary key = date + person).
--   * side_quest_prefs: a person's active window (quiet hours are everything outside it).
--   * daily_reports: "report this photo" on the community board.
--   * daily_entries gets the Side Quest fields: audience (private by default), caption, on-time,
--     the private storage key, the board post and optional crew memory. Existing rows keep working.
--   * posts.target_type allows 'sidequest' (the community board; target_id = a uuid derived from the date).
-- 0004 is reserved for hangout ratings (#11) and 0005 for the Memories boards branch.

create table public.side_quest_drops (
  date              date not null,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  challenge_id      text not null,
  drop_at           timestamptz not null,
  deadline_at       timestamptz not null,
  duration_minutes  integer not null check (duration_minutes between 5 and 240),
  window_start_min  integer not null check (window_start_min between 0 and 1439),
  window_end_min    integer not null check (window_end_min between 1 and 1440),
  tz                text not null,
  demo              boolean not null default false,
  created_at        timestamptz not null default now(),
  primary key (date, user_id),
  check (deadline_at > drop_at)
);
create index side_quest_drops_date_idx on public.side_quest_drops (date);

create table public.side_quest_prefs (
  user_id           uuid primary key references public.profiles(id) on delete cascade,
  window_start_min  integer not null check (window_start_min between 0 and 1439),
  window_end_min    integer not null check (window_end_min between 1 and 1440),
  tz                text not null,
  updated_at        timestamptz not null default now(),
  check (window_end_min - window_start_min >= 120)
);

create table public.daily_reports (
  date         date not null,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  reporter_id  uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (date, user_id, reporter_id)
);

alter table public.daily_entries
  add column challenge_id    text,
  add column audience        text not null default 'only_me' check (audience in ('only_me', 'community')),
  add column caption         text not null default '',
  add column on_time         boolean not null default true,
  add column photo_key       text,
  add column post_id         uuid references public.posts(id) on delete set null,
  add column crew_memory_id  uuid references public.memories(id) on delete set null,
  add column submitted_at    timestamptz;

alter table public.posts drop constraint if exists posts_target_type_check;
alter table public.posts add constraint posts_target_type_check
  check (target_type in ('profile', 'group', 'event', 'sidequest'));

-- RLS on, no anon policies, as for every table: the browser never reads these directly.
alter table public.side_quest_drops enable row level security;
alter table public.side_quest_prefs enable row level security;
alter table public.daily_reports    enable row level security;
