# Migrations

Plain SQL files in this folder are applied by `scripts/db-migrate.mjs`, not by the Supabase CLI.

- Name files so they sort in apply order: `0001_init.sql`, `0002_...sql`.
- Each file runs inside its own transaction and is recorded in `public._migrations`; a recorded file is skipped on the next run.
- `npm run db:migrate:dev` targets the dev project (`SUPABASE_DB_URL_DEV`). `npm run db:migrate:demo` targets the demo project (`SUPABASE_DB_URL`) and needs a human's approval.
- Never edit a file that has been applied; add a new one.

## Files

- `0001_init.sql`: every table, RLS on with no policies, `join_quest` / `leave_quest`.
- `0002_location_shares.sql`: Find My shares and status bubbles.
- `0003_quest_events.sql`: plan visibility (`quests.visibility`), pop-up (`poster_url`, `bubble_text`), `quest_checkins`, `quest_reports`, and posts on a plan (`posts.target_type = 'quest'`). Apply before `npm run seed` / `seed:demo`: the seed writes the new columns.
- `0007_listing_pickups.sql`: Marketplace pickup on the map: `listings.pickup_until/pickup_label/pickup_spot`, `listing_holds`, `muse_wants`, and the `listing_hold` / `listing_update` notification types. Apply before seeding: the seed writes the new columns.
- `0008_watch_events.sql`: `watch_events` (what a person watched and for how long), read by Muse's Marketplace picks.
