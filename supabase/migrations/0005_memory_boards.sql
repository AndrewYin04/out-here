-- Memories boards: posts can target a crew (private board for the crew's members) or a quest on the
-- public community board. Visibility is enforced in the data layer (View.canSeePost); RLS stays on
-- with no anon policies, as for every table. 0004 is reserved for hangout ratings (issue #11).
alter table public.posts drop constraint if exists posts_target_type_check;
alter table public.posts add constraint posts_target_type_check
  check (target_type in ('profile', 'group', 'event', 'crew', 'community'));
