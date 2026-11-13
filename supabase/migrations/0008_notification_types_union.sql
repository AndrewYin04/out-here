-- One list of allowed notification types and object types.
-- Any later migration that changes these checks must keep every value listed here;
-- tests/unit/migrations-notifications.test.ts enforces it.
--
-- Each migration that rebuilt these checks replaced the whole list, so two branches that each
-- added a value dropped the other's value. 0007_listing_pickups (listing_hold, listing_update,
-- listing) dropped 'intro' from 0003_intros, and every Muse Intro notification insert failed.
-- This file is the union of every list on every branch:
--   0001_init:            friend_request, friend_accept, comment, reply, reaction, group_post,
--                         event_invite, quest_invite, quest_join, message;
--                         object types post, comment, profile, group, event, quest, invite, thread
--   0003_intros:          type intro, object type intro
--   0004_hangout_ratings: type hangout_rate
--   0007_listing_pickups: types listing_hold, listing_update, object type listing
-- Idempotent: it drops each check if it exists and re-creates it.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'friend_request', 'friend_accept', 'comment', 'reply', 'reaction', 'group_post', 'event_invite',
  'quest_invite', 'quest_join', 'message', 'intro', 'hangout_rate', 'listing_hold', 'listing_update'));

alter table public.notifications drop constraint if exists notifications_object_type_check;
alter table public.notifications add constraint notifications_object_type_check check (object_type in (
  'post', 'comment', 'profile', 'group', 'event', 'quest', 'invite', 'thread', 'intro', 'listing'));
