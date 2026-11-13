# Daily Side Quests

A surprise real-world challenge once a day. Everyone gets the same prompt; each person gets their own random drop time and deadline. It arrives as a **popup on the Out Here map**. They take a photo, it is saved to their Memories, and they can choose to share it on the **community board in Memories**.

**Loop:** surprise popup on the map, timed mission, photo, quest complete, community board in Memories, back tomorrow.

Branch: `feature/daily-side-quests`. Code: `src/features/daily/` (UI), `src/features/data/sidequest.ts` (server rules), `src/shared/sidequest.ts` (pool, schedule, time zones, phases). There is no separate Side Quest page and no demo controls.

## Where it lives

- **The popup, on the Out Here map (`/out-here`).** `SideQuestHost` (mounted once in the shell, active only on the map page) shows a one-time popup when the drop arrives or is already live when the map opens: challenge, live countdown, **Take photo**. Take photo opens the camera, review and completion in the same popup flow. **Later** minimizes it to a small countdown pill on the map; tapping the pill brings it back, so dismissing never loses the quest. It does not poll anywhere else.
- **The Side Quest section of Memories (`/memories`).** `SideQuestSection` sits at the top of the existing Memories page: today's challenge, then two tabs. **Community board** holds the shared photos (reactions, report, remove). **My Side Quests** holds your own photos, the weekly streak with a 7-day strip, and quiet hours. After completing a quest, "See the community board" goes to `/memories#side-quest` (and "View memory" to `#side-quest-mine`).

## How it works

- **One shared prompt per date.** `challengeFor(date)` picks from a curated pool of 15 free challenges (Accidental Art, The Doppelgänger, Tiny World, Color Hunt, Hidden Face, Secret Spot, Unexpected Beauty, Shadow Play, New Perspective, Something Blue, ...). No model call. The pool never repeats inside 15 days.
- **Dates and time zones.** A person's "today" is their calendar date in their own zone (default `America/Los_Angeles`, the project zone). Wall-clock to UTC conversion is DST-safe (tested on both US transitions and UK).
- **Random drop, rolled once.** On a person's first read of the day the server rolls a drop time inside their active window (default 10 AM to 8 PM) and a deadline from the challenge's own range (observation 15-30 min, creative 20-45, exploration 45-90, social 60-120), so that the whole quest fits inside the window. It is stored in `side_quest_drops` (primary key date + person), so a refresh, another device or a changed device clock never rerolls or extends it. The only randomness is `crypto.getRandomValues` on the server, once per person per day.
- **Quiet hours.** Each person can set their active window (at least 2 hours) under My Side Quests. It applies to days that have no drop yet; today's persisted drop never moves. Nothing is scheduled outside the window.
- **Deadlines are server-side.** The deadline starts at the drop time, not when the app is opened. A submission is accepted only before the deadline plus a 10 second in-flight tolerance (`SUBMIT_GRACE_MS`); after that the server answers `410 quest_ended`. Before the drop: `409 not_dropped_yet`. A second submission (including two taps at once): `409 already_completed`.
- **Missing it is calm.** An ended quest just closes. No streak-loss messages, no shaming. The board and Memories stay open.
- **The countdown** uses the persisted timestamps and a clock offset measured against the server's clock, so it is right after a refresh, after switching tabs, and with a wrong device clock. It stops at zero and never shows a negative time. Automated browsers (`navigator.webdriver`) skip the automatic popup so it never blocks tests; the pill still appears.

## Photos, privacy and Memories

- **Camera first.** `getUserMedia` viewfinder with a shutter button, retake before submitting, and "Choose a photo" when the camera is denied, missing or unsupported. Photos are resized to at most 1600 px and re-encoded as JPEG on the device, which also drops EXIF (including GPS). Nothing uploads until the person confirms.
- **Complete means the server said yes.** The success screen appears only after the server accepts the photo; a failed upload keeps the photo and offers a retry.
- **Private by default.** The audience is **Only me** unless the person picks **Share with community**. Photos are stored in the private `crew-photos` bucket and served by `/api/daily/photo`, which answers the owner, or anyone while the owner shares it, and otherwise a plain 404.
- **Crew albums are a separate choice.** "Did you do it with friends?" lets a crew member also add the photo to a crew album they belong to (one stored copy, shared by the memory and the entry).
- **Saved to Memories.** Every completed quest is a record in `daily_entries` (user, date, challenge, photo, audience, on-time, submitted time, optional crew memory), shown under My Side Quests. No invented coordinates.

## Community board

- Photo-first grid of entries people explicitly shared. Sharing creates a public post of the new `sidequest` target, so the existing Facebook reactions work on it. These posts never appear in the home feed or in anyone's profile photos.
- **Reveal rule.** While your own window is open and you have not entered, you see the prompt and the count with blurred placeholders. After you enter, once your quest has ended, or on later days, the photos appear. Nobody is permanently locked out.
- **Names.** Friends and you in full; everyone else by first name only (decided on the server).
- **Report and remove.** Report writes to `daily_reports`. "Remove" unshares: the board post and its reactions are deleted, the photo stays private in the person's Memories.
- The board refreshes every 20 seconds while visible and when the tab regains focus (polling; no realtime channel).

## Streaks

The weekly in-person streak (`GET /api/me/:userId/streak`, weeks in a row with a completed hangout) is unchanged and shown on its own. A Side Quest photo never counts as a hangout. Next to it: the last seven days of Side Quests and the total completed, from real records only. There is no consecutive-day streak.

## API

| Route | What |
|---|---|
| `GET /api/daily/side-quest` | Today's state (creates the persisted drop on first read) |
| `POST /api/daily/side-quest/submit` | multipart: `photo`, `audience`, `caption?`, `crewId?` |
| `GET /api/daily/side-quest/board?date` | Board entries (shared only, reveal rule applied) |
| `DELETE /api/daily/side-quest/entry?date` | Unshare |
| `POST /api/daily/side-quest/report` | `{ date, userId }` |
| `GET /api/daily/side-quest/history` | Last 7 days and Side Quest memories |
| `GET`/`PUT /api/daily/side-quest/prefs` | Active window (quiet hours) |
| `GET /api/daily/photo?date&userId` | Photo bytes, access-checked |

The older `GET /api/daily` and `POST /api/daily/entry` are left as they were.

## Database (migration `0006_side_quests.sql`)

**Must be applied before the Supabase-backed app can use Side Quests** (`npm run db:migrate:dev` / `:demo`). In MemoryStore mode (no Supabase env) nothing is needed.

New tables `side_quest_drops`, `side_quest_prefs`, `daily_reports`. `daily_entries` gains `challenge_id`, `audience`, `caption`, `on_time`, `photo_key`, `post_id`, `crew_memory_id`, `submitted_at` (existing rows keep working). `posts.target_type` also allows `'sidequest'`. RLS is on with no anon policies. 0004 is reserved for hangout ratings (#11) and 0005 for the Memories boards branch.

## Seeing it during development

The drop time is random, and there is no trigger. To see the popup on a persona that has not opened Out Here today, open **Memories, My Side Quests, Quiet hours** and set a two-hour window around the current time, then open the Out Here map. The drop lands somewhere in that window, so it may be live, still coming, or already over; try another persona if so. Everything else (rules, privacy, the board) is covered by `tests/unit/side-quests.test.ts` and `tests/unit/side-quest-schedule.test.ts`.

## Not done / known limits

- **No on-demand trigger.** Because the drop is random, a live presentation cannot make the popup appear on cue. If the team wants a presenter control later, it needs a server-side switch like the one this branch used to have (removed on request).
- **Empty board until people share.** Nothing is seeded onto the board, so on a fresh database it starts empty ("Be the first").
- **Notifications.** The surprise appears when the Out Here map is open. There is no background web push and no notification type for it; no push infrastructure exists, so none is claimed.
- **Comments.** The board supports reactions (the existing Like). Comments are not on the board: the existing comment API would expose strangers' full names.
- **Muse.** No Muse call and no generated captions.
- **Jolly.** No approved asset is on `main`, so none is drawn.
- **Reports** are stored; there is no moderation queue yet.
- **Time zone** defaults to the project zone; the quiet-hours card edits the window, not the zone.
- **Shared-file changes (all small):** `src/shared/{types,api,index}.ts`, `src/features/data/{core,db,seed-build,store,view}.ts`, `src/features/fb/shell/AppShell.tsx` (mounts the host), `src/features/memories/MemoriesPage.tsx` (one section), `src/app/globals.css` (three animations).
