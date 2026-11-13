-- 0003_intros.sql added the 'intro' notification type and object type; 0007_listing_pickups.sql
-- rewrote the same check constraints without it. This restores the union of both.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'friend_request', 'friend_accept', 'comment', 'reply', 'reaction', 'group_post', 'event_invite',
  'quest_invite', 'quest_join', 'message', 'intro', 'listing_hold', 'listing_update'));
alter table public.notifications drop constraint if exists notifications_object_type_check;
alter table public.notifications add constraint notifications_object_type_check check (object_type in (
  'post', 'comment', 'profile', 'group', 'event', 'quest', 'invite', 'thread', 'intro', 'listing'));
