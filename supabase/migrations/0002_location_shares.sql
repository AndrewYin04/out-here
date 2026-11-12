-- Friend locations + status bubbles ("Find My" inside Facebook). See .claude/rules/00-mission.md P0 item 1a.
-- One row per user. Visibility is enforced in route handlers with canSee() on `audience`;
-- RLS is on with no policies, like every other table, so the public key reads nothing.
create table public.location_shares (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  lat          double precision not null,
  lng          double precision not null,
  place_label  text,
  precision    text not null default 'exact' check (precision in ('exact', 'approximate')),
  audience     text not null default 'friends',   -- public | friends | list:<uuid> | only_me
  paused       boolean not null default false,
  emoji        text,
  thought      text check (char_length(thought) <= 80),
  doing        text check (char_length(doing) <= 80),
  wants_to     text check (char_length(wants_to) <= 80),
  updated_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '4 hours'
);

create index location_shares_expires_idx on public.location_shares (expires_at);

alter table public.location_shares enable row level security;
