# Daily Side Quests

A surprise real-world challenge once a day. Everyone gets the same prompt; each person gets their own random drop time and deadline. They take a photo, it is saved to their Memories, and they can choose to share it on a community board.

**Loop:** surprise drop, timed mission, photo, quest complete, community reveal, Memories, back tomorrow.

Branch: `feature/daily-side-quests`. Page: `/side-quest`. Code: `src/features/daily/` (UI), `src/features/data/sidequest.ts` (server rules), `src/shared/sidequest.ts` (pool, schedule, time zones, phases).

## How it works

- **One shared prompt per date.** `challengeFor(date)` picks from a curated pool of 15 free challenges (Accidental Art, The Doppelgänger, Tiny World, Color Hunt, Hidden Face, Secret Spot, Unexpected Beauty, Shadow Play, New Perspective, Something Blue, ...). No model call. The pool never repeats inside 15 days.
- **Dates and time zones.** A person's "today" is their calendar date in their own zone (default `America/Los_Angeles`, the project zone). Wall-clock to UTC conversion is DST-safe (tested on both US transitions and UK).
- **Random drop, rolled once.** On a person's first read of the day the server rolls a drop time inside their active window (default 10 AM to 8 PM) and a deadline from the challenge's own range (observation 15-30 min, creative 20-45, exploration 45-90, social 60-120), such that the whole quest fits inside the window. It is stored in `side_quest_drops` (primary key date + person), so a refresh, another device or a changed device clock never rerolls or extends it. The only randomness is `crypto.getRandomValues` on the server, once per person per day.
- **Quiet hours.** Each person can set their active window (at least 2 hours). It applies to days without a drop yet; today's persisted drop never moves. Nothing is ever scheduled outside the window.
- **Deadlines are server-side.** The deadline starts at the drop time, not when the app is opened. A submission is accepted only before the deadline plus a 10 second in-flight tolerance (`SUBMIT_GRACE_MS`); after that the server answers `410 quest_ended`. Before the drop it answers `409 not_dropped_yet`. A second submission (including two taps at once) gets `409 already_completed`.
- **Missing it is calm.** An ended quest shows "Quest ended", the board, and Memories. No streak-loss messages, no shaming.
- **The surprise reaches you.** The shell mounts `SideQuestHost`: when the drop arrives (or is live when you open the app) a one-time reveal appears; afterwards a small pill with the live countdown stays on screen. The countdown uses the persisted timestamps and a clock offset measured against the server's clock, so it is right after a refresh, after switching tabs, and with a wrong device clock. It stops at zero and never shows a negative time. Automated browsers (`navigator.webdriver`) skip the reveal so it never blocks tests.

## Photos, privacy and Memories

- **Camera first.** `getUserMedia` viewfinder with a shutter button, retake before submitting, and "Choose a photo" when the camera is denied, missing or unsupported. Photos are resized to at most 1600 px and re-encoded as JPEG on the device, which also drops EXIF (including GPS). Nothing uploads until the person confirms.
- **Complete means the server said yes.** The success screen appears only after the server accepts the photo.
- **Private by default.** The audience is **Only me** unless the person picks **Share with community**. Photos are stored in the private `crew-photos` bucket and served by `/api/daily/photo`, which answers the owner, or anyone while the owner shares it, and otherwise a plain 404.
- **Crew albums are a separate choice.** "Did you do it with friends?" lets a crew member also add the photo to a crew album they belong to (one stored copy, shared by the memory and the entry).
- **Saved to Memories.** Every completed quest is a record in `daily_entries` (user, date, challenge, photo, audience, on-time, submitted time, optional crew memory). It shows as the **Side Quest memories** strip on `/memories` and the full list on `/side-quest`. There are no invented coordinates.

## Community board

- Photo-first grid of entries people explicitly shared. Sharing creates a public post of the new `sidequest` target, so the existing Facebook reactions work on it. These posts never appear in the home feed or in anyone's profile photos.
- **Reveal rule.** Until you have entered (while your own window is open) you see the prompt and the count, with blurred placeholders. After you enter, or once your quest has ended, or on later days, the photos appear. Nobody is permanently locked out.
- **Names.** Friends and you in full; everyone else by first name only (decided on the server).
- **Report and remove.** Report writes to `daily_reports`. "Remove from board" unshares: the board post and its reactions are deleted, the photo stays private in the person's Memories.
- Realtime: the board refreshes every 20 seconds while visible and when the tab regains focus (polling; no realtime channel is used).

## Streaks

The weekly in-person streak (`GET /api/me/:userId/streak`, weeks in a row with a completed hangout) is unchanged and shown on its own. A Side Quest photo never counts as a hangout. The second, secondary view is the last seven days of Side Quests plus the total completed, from real records only. There is no consecutive-day streak.

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
| `POST /api/daily/side-quest/demo` | Demo controls (see below) |

The older `GET /api/daily` and `POST /api/daily/entry` are left as they were.

## Database (migration `0006_side_quests.sql`)

**Must be applied before the Supabase-backed app can use Side Quests** (`npm run db:migrate:dev` / `:demo`). In MemoryStore mode (no Supabase env) nothing is needed.

New tables `side_quest_drops`, `side_quest_prefs`, `daily_reports`. `daily_entries` gains `challenge_id`, `audience`, `caption`, `on_time`, `photo_key`, `post_id`, `crew_memory_id`, `submitted_at` (existing rows keep working). `posts.target_type` also allows `'sidequest'`. RLS is on with no anon policies. 0004 is reserved for hangout ratings (#11) and 0005 for the Memories boards branch.

## Demo mode

Judges cannot wait for a random drop. The **Demo controls** card on `/side-quest` has Trigger Side Quest drop, Set deadline (1, 2 or 5 minutes), Seed community entries and Reset.

**Protection is on the server, not in the buttons.** `POST /api/daily/side-quest/demo` answers 403 unless `OUTHERE_DEMO_CONTROLS=1` is set on the server (the demo deployment sets it), or the server runs in development with the variable unset. `OUTHERE_DEMO_CONTROLS=0` disables it everywhere. The caller must also be a demo persona. The panel is shown only when the server reports `demo: true`. No keys or tokens reach the browser.

**Reset touches only today's Side Quest records of demo personas**: their entries (with board posts, reactions, crew memories they created) and their drops. Quests, crews, other photos, map data and Facebook content are untouched, and running it twice is safe. After a reset the next read rolls a fresh, ordinary drop for the viewer.

### The two-persona demo (about 2 minutes)

1. Open `/side-quest?as=alex`. Click **Trigger Side Quest drop** (2 minutes). The blue mission card appears with the live countdown. (On any other Out Here page the reveal pops up first.)
2. Click **Seed community entries**. The board shows "5 entries" with blurred placeholders: you cannot see them yet.
3. **Take photo**, press the shutter (or **Choose a photo**), pick **Share with community**, **Submit**. The **Side Quest complete!** screen confirms it was saved to Memories and shared.
4. **See how others did it**: the board now shows Alex's entry and the five fictional ones.
5. Open a second window at `/side-quest?as=maya`. **Trigger**, take or choose a photo, share it. The same challenge appears; her board shows both her and Alex's entries (Alex in full, strangers by first name).
6. Back in Alex's window the board now has Maya's entry. Open **Memories** (`/memories?as=alex`): the **Side Quest memories** strip holds the photo.
7. The **Weekly streak** card shows the existing hangout streak, separately from Side Quests.
8. Click **Reset** before the next rehearsal.

## Not done / known limits

- **Notifications.** The surprise appears when Out Here is open (reveal and pill) and on `/side-quest`. There is no background web push and no `daily_drop` notification type; no push infrastructure exists, so none is claimed.
- **Comments.** The board supports reactions (the existing Like). Comments are not on the board; full names of strangers would leak through the existing comment API. Needs a first-name-only comment view first.
- **Muse.** "Find a plan with Muse" opens the existing I'm free composer. No new Muse call, no generated captions.
- **Jolly.** No approved Jolly asset is on `main`, so none is drawn.
- **Reports** are stored; there is no moderation queue yet.
- **Time zone** defaults to the project zone; the quiet-hours card edits the window, not the zone.
- **Seeded board photos** are the repo's fictional placeholder photos.
- **Shared-file changes (all small):** `src/shared/{types,api,index}.ts`, `src/features/data/{core,db,seed-build,store,view}.ts`, `src/features/fb/shell/{AppShell,nav,destinations}`, `src/features/memories/MemoriesPage.tsx` (one strip), `src/app/globals.css` (three animations), `.env.example`.
