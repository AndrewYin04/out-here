-- Marketplace pickup on the Out Here map. A seller turns on "Available for pickup until <time>";
-- the listing shows as a map pin until then. A buyer asks to reserve it (a hold request); the
-- seller accepts one, which holds the item for the buyer until the hold expires (derived on read,
-- no cron). "Reserved" is never stored on listings: it is an accepted hold that has not expired.
-- muse_wants are what a person told Muse they are looking for ("desk chair under $40").
-- RLS on with no policies, like every other table: route handlers use the server key.

alter table public.listings
  add column if not exists pickup_until timestamptz,
  add column if not exists pickup_label text check (char_length(pickup_label) <= 80),
  add column if not exists pickup_spot  text check (char_length(pickup_spot) <= 120);
create index if not exists listings_pickup_idx on public.listings (pickup_until) where pickup_until is not null;

create table if not exists public.listing_holds (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  buyer_id    uuid not null references public.profiles(id) on delete cascade,
  offer_usd   numeric(10, 2) not null,
  message     text not null default '' check (char_length(message) <= 300),
  eta_min     integer not null check (eta_min between 1 and 240),
  status      text not null default 'requested'
                check (status in ('requested', 'accepted', 'declined', 'cancelled', 'completed')),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  expires_at  timestamptz
);
create index if not exists listing_holds_listing_idx on public.listing_holds (listing_id, created_at desc);
alter table public.listing_holds enable row level security;

create table if not exists public.muse_wants (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  text          text not null check (char_length(text) <= 200),
  item          text not null,
  keywords      text[] not null default '{}',
  max_price     numeric(10, 2),
  max_drive_min integer,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists muse_wants_user_idx on public.muse_wants (user_id, created_at desc);
alter table public.muse_wants enable row level security;

-- Notifications for hold requests and their answers.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'friend_request', 'friend_accept', 'comment', 'reply', 'reaction', 'group_post', 'event_invite',
  'quest_invite', 'quest_join', 'message', 'listing_hold', 'listing_update'));
alter table public.notifications drop constraint if exists notifications_object_type_check;
alter table public.notifications add constraint notifications_object_type_check check (object_type in (
  'post', 'comment', 'profile', 'group', 'event', 'quest', 'invite', 'thread', 'listing'));
