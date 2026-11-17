-- Event creation in Out Here: who can see a plan, its pop-up, live check-ins, reports,
-- and posts on a plan's page. Visibility is enforced in route handlers (canSeeQuest in
-- src/shared/visibility.ts); RLS is on with no policies, like every other table.

-- ---------- quests: visibility + pop-up ----------
-- community = everyone nearby · group = members of group_id · open = host's friends and
-- friends of friends · friends = invited friends only. is_public stays and mirrors
-- visibility = 'community' so older readers keep working.
alter table public.quests
  add column visibility text not null default 'community'
    check (visibility in ('community', 'group', 'open', 'friends')),
  add column poster_url text,
  add column bubble_text text check (char_length(bubble_text) <= 80);

update public.quests set visibility = case
  when is_public then 'community'
  when group_id is not null then 'group'
  else 'open'
end;

alter table public.quests
  add constraint quests_group_visibility_check check (visibility <> 'group' or group_id is not null);

create index quests_host_created_idx on public.quests (host_id, created_at desc);

-- ---------- live check-ins ("5 here") ----------
create table public.quest_checkins (
  quest_id      uuid not null references public.quests(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  primary key (quest_id, user_id)
);

-- ---------- reports ----------
create table public.quest_reports (
  id          uuid primary key default gen_random_uuid(),
  quest_id    uuid not null references public.quests(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason      text not null default '' check (char_length(reason) <= 300),
  created_at  timestamptz not null default now(),
  unique (quest_id, reporter_id)
);

-- ---------- posts on a plan's page ----------
alter table public.posts drop constraint if exists posts_target_type_check;
alter table public.posts
  add constraint posts_target_type_check check (target_type in ('profile', 'group', 'event', 'quest'));

alter table public.quest_checkins enable row level security;
alter table public.quest_reports  enable row level security;
