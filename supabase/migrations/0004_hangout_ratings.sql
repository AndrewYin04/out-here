-- Post-hangout rating (spec: docs/HANGOUT_RATINGS.md).
-- A hangout is rated, never a person. hang_again holds each rater's private yes/no per other
-- attendee; only route handlers (server key) and Muse read it. RLS is on with no policies, like
-- every other table, so the publishable key reads nothing.
create table public.hangout_ratings (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  verdict text not null check (verdict in ('loved','fine','meh')),
  score numeric(3,1) not null check (score between 0 and 10),
  highlights text[] not null default '{}',
  note text not null default '',
  photo_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quest_id, rater_id)
);
create index hangout_ratings_rater_idx on public.hangout_ratings (rater_id, score desc);

create table public.hang_again (
  quest_id uuid not null references public.quests(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.profiles(id) on delete cascade,
  again boolean not null,
  created_at timestamptz not null default now(),
  primary key (quest_id, rater_id, subject_id),
  check (rater_id <> subject_id)
);
create index hang_again_subject_idx on public.hang_again (subject_id);

-- updated_at follows every update, even one that does not set it.
create or replace function public.hangout_ratings_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger hangout_ratings_touch before update on public.hangout_ratings
  for each row execute function public.hangout_ratings_touch();

alter table public.hangout_ratings enable row level security;
alter table public.hang_again      enable row level security;

-- "How was Dumpling Den?" notifications after a hangout ends.
-- Both lists are the union of every migration that sets them: 0001_init plus 'intro' from
-- 0003_intros (on overnight). This file sorts after 0003_intros, so a list without 'intro' here
-- would reject every Muse Intro notification. A later migration that edits these checks must keep
-- every value already listed.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'friend_request', 'friend_accept', 'comment', 'reply', 'reaction', 'group_post', 'event_invite',
  'quest_invite', 'quest_join', 'message', 'intro', 'hangout_rate'));
alter table public.notifications drop constraint if exists notifications_object_type_check;
alter table public.notifications add constraint notifications_object_type_check check (object_type in
  ('post', 'comment', 'profile', 'group', 'event', 'quest', 'invite', 'thread', 'intro'));
