-- 0001_init: Out Here kit tables + Facebook base tables in one graph.
-- Ids are uuid; the seed derives stable uuids from handles/slugs (src/shared/seed/ids.ts).
-- Every timestamp is timestamptz. RLS is enabled on every table with NO policies:
-- the browser never reads tables, only Next route handlers using the secret key do.

create extension if not exists pgcrypto;

-- ---------- people ----------
create table public.profiles (
  id               uuid primary key default gen_random_uuid(),
  handle           text not null unique check (handle ~ '^[a-z0-9_-]{2,32}$'),
  name             text not null,
  avatar_url       text not null default '',
  cover_url        text,
  bio              text not null default '',
  interests        text[] not null default '{}',
  budget_max       integer not null default 20 check (budget_max >= 0),
  home_lat         double precision not null,
  home_lng         double precision not null,
  is_demo_user     boolean not null default false,
  school           text,
  major            text,
  grad_year        integer,
  hometown         text,
  current_city     text,
  job              text,
  pronouns         text,
  age              integer,
  -- per-field audience: {"hometown":"friends","job":"list:<uuid>",...}; missing key = public
  field_visibility jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

-- one row per pair, user_a < user_b
create table public.friendships (
  user_a       uuid not null references public.profiles(id) on delete cascade,
  user_b       uuid not null references public.profiles(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (user_a, user_b),
  check (user_a < user_b),
  check (requester_id = user_a or requester_id = user_b)
);
create index friendships_user_b_idx on public.friendships (user_b);
create index friendships_status_idx on public.friendships (status) where status = 'pending';

create table public.friend_lists (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.friend_list_members (
  list_id  uuid not null references public.friend_lists(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index friend_list_members_user_idx on public.friend_list_members (user_id);

-- ---------- groups ----------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  privacy     text not null default 'public' check (privacy in ('public', 'private')),
  description text not null default '',
  tags        text[] not null default '{}',
  cover_url   text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('admin', 'moderator', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

-- ---------- places ----------
create table public.places (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  category         text not null,
  address          text not null default '',
  description      text not null default '',
  lat              double precision not null,
  lng              double precision not null,
  price_level      smallint not null default 1 check (price_level between 1 and 4),
  typical_cost_usd numeric(8, 2) not null default 0,
  -- {"mon":[["11:00","21:00"]],...} in America/Los_Angeles
  hours            jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

-- ---------- Out Here (kit) ----------
create table public.availability (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  text       text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  lat        double precision not null,
  lng        double precision not null,
  intent     jsonb,
  audience   text not null default 'friends' check (audience ~ '^(public|friends|only_me|list:.+)$'),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index availability_user_idx on public.availability (user_id, ends_at desc);
create index availability_ends_idx on public.availability (ends_at);

create table public.quests (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  emoji       text not null default '✨',
  category    text not null check (category in
                ('food', 'music', 'sports', 'study', 'thrift', 'art', 'outdoors', 'games', 'other')),
  description text not null default '',
  venue_name  text not null,
  place_id    uuid references public.places(id) on delete set null,
  group_id    uuid references public.groups(id) on delete set null,
  lat         double precision not null,       -- exact: members only
  lng         double precision not null,
  approx_lat  double precision not null,       -- ~200 m fuzz: everyone else
  approx_lng  double precision not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  capacity    integer not null check (capacity > 0),
  price_max   numeric(8, 2) not null default 0,
  tags        text[] not null default '{}',
  status      text not null default 'open' check (status in ('open', 'full', 'live', 'done')),
  is_public   boolean not null default true,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index quests_starts_idx on public.quests (starts_at);
create index quests_status_starts_idx on public.quests (status, starts_at);
create index quests_group_idx on public.quests (group_id) where group_id is not null;

create table public.quest_members (
  quest_id      uuid not null references public.quests(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  joined_at     timestamptz not null default now(),
  via_friend_id uuid references public.profiles(id) on delete set null,
  primary key (quest_id, user_id)
);
create index quest_members_user_idx on public.quest_members (user_id);

create table public.invites (
  id               uuid primary key default gen_random_uuid(),
  from_id          uuid not null references public.profiles(id) on delete cascade,
  to_id            uuid not null references public.profiles(id) on delete cascade,
  quest_id         uuid references public.quests(id) on delete set null,
  suggestion_title text not null default '',
  message          text not null default '',
  status           text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at       timestamptz not null default now(),
  responded_at     timestamptz
);
create index invites_to_idx on public.invites (to_id, status, created_at desc);
create index invites_from_idx on public.invites (from_id, created_at desc);

create table public.crews (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  origin_quest_id uuid references public.quests(id) on delete set null,
  shared_prefs    text[] not null default '{}',
  last_hangout_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table public.crew_members (
  crew_id uuid not null references public.crews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (crew_id, user_id)
);
create index crew_members_user_idx on public.crew_members (user_id);

create table public.memories (
  id          uuid primary key default gen_random_uuid(),
  crew_id     uuid not null references public.crews(id) on delete cascade,
  quest_id    uuid references public.quests(id) on delete set null,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  photo_url   text not null,
  caption     text not null default '',
  created_at  timestamptz not null default now()
);
create index memories_crew_idx on public.memories (crew_id, created_at desc);

create table public.daily_quests (
  date   date primary key,
  prompt text not null,
  emoji  text not null default '✨'
);

create table public.daily_entries (
  date       date not null references public.daily_quests(date) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  photo_url  text not null,
  verified   boolean,
  muse_note  text not null default '',
  created_at timestamptz not null default now(),
  primary key (date, user_id)
);

-- ---------- events ----------
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  description text not null default '',
  group_id    uuid references public.groups(id) on delete set null,
  host_id     uuid not null references public.profiles(id) on delete cascade,
  place_id    uuid references public.places(id) on delete set null,
  venue_name  text not null default '',
  lat         double precision,
  lng         double precision,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  price_usd   numeric(8, 2) not null default 0,
  capacity    integer,
  category    text not null check (category in ('music', 'food', 'sports', 'social', 'study', 'arts')),
  cover_url   text,
  created_at  timestamptz not null default now()
);
create index events_starts_idx on public.events (starts_at);
create index events_group_idx on public.events (group_id) where group_id is not null;

create table public.event_rsvps (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  status     text not null check (status in ('going', 'interested', 'invited')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_rsvps_user_idx on public.event_rsvps (user_id);

-- ---------- feed ----------
create table public.posts (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references public.profiles(id) on delete cascade,
  target_type    text not null default 'profile' check (target_type in ('profile', 'group', 'event')),
  target_id      uuid not null,   -- profile, group or event id (polymorphic, no FK)
  audience       text not null default 'friends' check (audience ~ '^(public|friends|only_me|list:.+)$'),
  text           text not null default '',
  media          text[] not null default '{}',
  shared_post_id uuid references public.posts(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index posts_created_idx on public.posts (created_at desc);
create index posts_target_idx on public.posts (target_type, target_id, created_at desc);
create index posts_author_idx on public.posts (author_id, created_at desc);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  parent_id  uuid references public.comments(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);

create table public.reactions (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null check (type in ('like', 'love', 'care', 'haha', 'wow', 'sad', 'angry')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index reactions_user_idx on public.reactions (user_id);

create table public.stories (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  media_url  text not null,
  audience   text not null default 'friends' check (audience ~ '^(public|friends|only_me|list:.+)$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index stories_created_idx on public.stories (created_at desc);

-- ---------- messenger ----------
create table public.threads (
  id              uuid primary key default gen_random_uuid(),
  name            text,
  is_group        boolean not null default false,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz
);
create index threads_last_message_idx on public.threads (last_message_at desc);

create table public.thread_members (
  thread_id    uuid not null references public.threads(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  primary key (thread_id, user_id)
);
create index thread_members_user_idx on public.thread_members (user_id);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.threads(id) on delete cascade,
  from_id    uuid not null references public.profiles(id) on delete cascade,
  text       text not null default '',
  kind       text not null default 'text' check (kind in ('text', 'invite')),
  invite_id  uuid references public.invites(id) on delete set null,
  created_at timestamptz not null default now()
);
create index messages_thread_idx on public.messages (thread_id, created_at);

-- ---------- notifications ----------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type         text not null check (type in ('friend_request', 'friend_accept', 'comment', 'reply',
                 'reaction', 'group_post', 'event_invite', 'quest_invite', 'quest_join', 'message')),
  actor_id     uuid references public.profiles(id) on delete cascade,
  object_type  text not null check (object_type in
                 ('post', 'comment', 'profile', 'group', 'event', 'quest', 'invite', 'thread')),
  object_id    uuid not null,
  text         text not null default '',
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

-- ---------- marketplace / reels ----------
create table public.listings (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  price_usd   numeric(10, 2) not null default 0,
  condition   text not null default '',
  category    text not null default '',
  description text not null default '',
  image_url   text,
  lat         double precision,
  lng         double precision,
  status      text not null default 'available' check (status in ('available', 'pending', 'sold')),
  created_at  timestamptz not null default now()
);
create index listings_created_idx on public.listings (created_at desc);

create table public.reels (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  video_url  text not null,
  poster_url text,
  caption    text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- Muse log ----------
-- No FK to profiles on purpose: re-seeding (TRUNCATE ... CASCADE) keeps this log.
create table public.muse_runs (
  id                uuid primary key default gen_random_uuid(),
  route             text not null,
  model             text not null,
  user_id           uuid,
  latency_ms        integer not null default 0,
  input_hash        text not null,
  output            jsonb,
  prompt_tokens     integer,
  completion_tokens integer,
  ok                boolean not null default true,
  error             text,
  created_at        timestamptz not null default now()
);
create index muse_runs_created_idx on public.muse_runs (created_at desc);
create index muse_runs_hash_idx on public.muse_runs (input_hash);

-- ---------- RLS: enabled everywhere, no policies ----------
alter table public.profiles            enable row level security;
alter table public.friendships         enable row level security;
alter table public.friend_lists        enable row level security;
alter table public.friend_list_members enable row level security;
alter table public.groups              enable row level security;
alter table public.group_members       enable row level security;
alter table public.places              enable row level security;
alter table public.availability        enable row level security;
alter table public.quests              enable row level security;
alter table public.quest_members       enable row level security;
alter table public.invites             enable row level security;
alter table public.crews               enable row level security;
alter table public.crew_members        enable row level security;
alter table public.memories            enable row level security;
alter table public.daily_quests        enable row level security;
alter table public.daily_entries       enable row level security;
alter table public.events              enable row level security;
alter table public.event_rsvps         enable row level security;
alter table public.posts               enable row level security;
alter table public.comments            enable row level security;
alter table public.reactions           enable row level security;
alter table public.stories             enable row level security;
alter table public.threads             enable row level security;
alter table public.thread_members      enable row level security;
alter table public.messages            enable row level security;
alter table public.notifications       enable row level security;
alter table public.listings            enable row level security;
alter table public.reels               enable row level security;
alter table public.muse_runs           enable row level security;
alter table public._migrations         enable row level security;

-- ---------- seats: the only way to take or give back a seat ----------
-- join_quest locks the quest row, so two people racing for the last seat are serialized:
-- one gets it, the other gets 'quest_full'. Joining twice is a no-op.
-- With p_with_friend both people join together or neither does.
-- Returns seats left. Errors (message text): quest_not_found, quest_closed, quest_full.
create or replace function public.join_quest(p_quest uuid, p_user uuid, p_with_friend uuid default null)
returns integer
language plpgsql
set search_path = public
as $$
declare
  q       public.quests%rowtype;
  members integer;
  needed  integer := 0;
begin
  select * into q from public.quests where id = p_quest for update;
  if not found then
    raise exception 'quest_not_found' using errcode = 'P0002', detail = p_quest::text;
  end if;
  if q.status = 'done' then
    raise exception 'quest_closed' using errcode = 'P0001', detail = p_quest::text;
  end if;

  if not exists (select 1 from public.quest_members where quest_id = p_quest and user_id = p_user) then
    needed := needed + 1;
  end if;
  if p_with_friend is not null and p_with_friend <> p_user
     and not exists (select 1 from public.quest_members where quest_id = p_quest and user_id = p_with_friend) then
    needed := needed + 1;
  end if;

  select count(*) into members from public.quest_members where quest_id = p_quest;
  if needed = 0 then
    return greatest(q.capacity - members, 0);
  end if;
  if members + needed > q.capacity then
    raise exception 'quest_full'
      using errcode = 'P0001',
            detail = format('quest %s has %s of %s seats taken, %s needed', p_quest, members, q.capacity, needed),
            hint = 'respond 409';
  end if;

  insert into public.quest_members (quest_id, user_id, via_friend_id)
  values (p_quest, p_user, case when p_with_friend <> p_user then p_with_friend end)
  on conflict do nothing;
  if p_with_friend is not null and p_with_friend <> p_user then
    insert into public.quest_members (quest_id, user_id, via_friend_id)
    values (p_quest, p_with_friend, p_user)
    on conflict do nothing;
  end if;

  members := members + needed;
  if members >= q.capacity and q.status = 'open' then
    update public.quests set status = 'full' where id = p_quest;
  end if;
  return q.capacity - members;
end;
$$;

-- leave_quest gives the seat back and reopens a full quest. Leaving when not a member is a no-op.
create or replace function public.leave_quest(p_quest uuid, p_user uuid)
returns integer
language plpgsql
set search_path = public
as $$
declare
  q       public.quests%rowtype;
  members integer;
begin
  select * into q from public.quests where id = p_quest for update;
  if not found then
    raise exception 'quest_not_found' using errcode = 'P0002', detail = p_quest::text;
  end if;
  delete from public.quest_members where quest_id = p_quest and user_id = p_user;
  select count(*) into members from public.quest_members where quest_id = p_quest;
  if q.status = 'full' and members < q.capacity then
    update public.quests set status = 'open' where id = p_quest;
  end if;
  return greatest(q.capacity - members, 0);
end;
$$;

revoke all on function public.join_quest(uuid, uuid, uuid) from public;
revoke all on function public.leave_quest(uuid, uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.join_quest(uuid, uuid, uuid) from anon, authenticated';
    execute 'revoke all on function public.leave_quest(uuid, uuid) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.join_quest(uuid, uuid, uuid) to service_role';
    execute 'grant execute on function public.leave_quest(uuid, uuid) to service_role';
  end if;
end;
$$;
