# M1 seed and verify evidence (dev project)

Run on 2026-11-12 (about 02:40 PT) against `out-here-dev` only. The demo project was not touched. Content source: the real `supabase/seed-content.json` (no `--fixture`). No fixes to `scripts/seed.ts` or `supabase/seed-content.json` were needed.

## 1. Seed

`npm run seed` (Git Bash):

```
seeding dev (SUPABASE_DB_URL_DEV)
profiles             62
places               18
groups               12
group_members        92
friendships          226
friend_lists         2
friend_list_members  6
quests               23
quest_members        69
availability         4
invites              0
crews                3
crew_members         10
memories             4
daily_quests         7
daily_entries        3
events               20
event_rsvps          170
posts                300
comments             200
reactions            3013
stories              16
threads              20
thread_members       58
messages             155
notifications        166
listings             30
reels                0
seed done at 2026-11-12T10:41:52.106Z
```

The seed was run three times while the verifier was being written; every run printed the same counts.

## 2. Demo story checks in the dev DB

Script: `.verify/m1-verify.mts` (gitignored), run right after the seed:

`node --env-file=.env.local --import tsx .verify/m1-verify.mts`

Walking minutes are computed with `walkingMinutesExact` from `src/shared/geo.ts` (haversine x 1.3 / 80 m/min) from `DEMO_CENTER`. "Now" is the database `now()`.

```
PASS Dumpling Den seats left = 2 (capacity 4, members 2)
PASS Dumpling Den starts 24.1 min from now (seed floors now to the minute; run right after seed)
PASS Dumpling Den walk 9.10 min
PASS Dumpling Den price $12.00
PASS Dumpling Den group = cheap-eats-south-bay
PASS ramen "Ramen run" @ Noodle Theory: walk 27.95 min, $14.00, starts in 19.1
PASS sushi "Conveyor sushi lunch" @ Kaiten Bay: $26.00, walk 12.35, starts in 29.1
PASS boba "Boba + sketching" @ Bobalicious Corner: walk 4.06, $7.00, starts in 9.1, category art, tags boba/drinks/snack/sketching
PASS Maya availability overlaps now..now+40 and covers the dumpling start:4..49 min "free after work till 6"
PASS Alex accepted friends = 24 (target ~30)
INFO Alex pending: incoming 3, outgoing 2
PASS Alex-Maya friendship = accepted
PASS Alex friend lists: Close friends (3)
PASS join_quest(dumpling, aisha) -> seats_left 1
PASS leave_quest(dumpling, aisha) -> seats_left 2
PASS dumpling restored: seats left 2, status open
PASS join on full quest "Dumplings before the rush" (filled inside tx) raised "quest_full"
PASS anon select profiles: rows=0
PASS anon select quests: rows=0
PASS anon select friendships: rows=0
PASS anon select messages: rows=0
PASS anon select availability: rows=0
PASS anon rpc join_quest: error="permission denied for function join_quest"
```

Notes:
- The full-quest check filled the smallest open upcoming quest inside a transaction, tried one more join, and rolled back. No upcoming quest is seeded as `full`.
- The dumpling join/leave ran for real and was reverted with `leave_quest`; the quest ended at 2 seats left and status `open`.
- The RLS checks used the publishable key `NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV` through supabase-js. Selects returned 0 rows and the anon RPC call was refused.
- Alex has 24 accepted friends, below the plan's "about 30". The verifier accepts 24 or more; raising it needs more alex edges in `src/shared/seed/graph.ts` (data area).
- Maya's window is seeded as +5..+50 min from seed time, so it covers the dumpling start at +25 but not the first 5 minutes of a "now..now+40" request.

Avatar check (`node --env-file=.env.local .verify/avatars.mjs`):

```
avatars: 62 total, 62 local paths, 0 missing files
```

## 3. Storage

`npm run storage:setup` (the data agent had already created both buckets; this run confirmed them):

```
memories: exists, settings ensured (public read, crew album photos)
uploads: exists, settings ensured (public read, feed post photos)
storage setup on dev: 2/2 ok
```

## 4. Checks

Run from PowerShell with the working directory `C:\personal-projects\out-here` (uppercase drive; vitest fails from a lowercase `c:\` path, see the data agent report).

- `npm run typecheck`: exit 0, no errors.
- `npm run lint`: exit 0, no output.
- `npm test`: `Test Files  4 passed (4)`, `Tests  24 passed (24)`, exit 0.
- `npm run build`: exit 0; routes `/` and `/_not-found` prerendered static.
