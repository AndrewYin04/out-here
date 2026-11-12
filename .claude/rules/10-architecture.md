# 10 — Architecture, folder ownership, contracts

## Stack (fixed — do not swap)
- **Next.js 15 (App Router) + TypeScript (strict) + Tailwind CSS**, npm.
- **Supabase**: Postgres, Realtime (server-sent Broadcast and Presence, see "Data access and realtime" below), Storage (photos). `@supabase/supabase-js` v2 (2.119.0 on 2026-11-12). `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` keep their names but hold the new `sb_publishable_...` and `sb_secret_...` keys, because legacy keys are deprecated by end of 2026.
- **MapLibre GL JS** (`maplibre-gl`, no React wrapper) with the **OpenFreeMap Positron** style `https://tiles.openfreemap.org/styles/positron` (no API key). Attribution: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap". The map is client-only (`dynamic(..., { ssr: false })`, map created in `useEffect`) and imports `maplibre-gl/dist/maplibre-gl.css`. Do not add Leaflet, react-leaflet, or CARTO.
- Map order: first the overhead Menlo Park map with quest pins and live seat counts. Only after join works live on two devices (P0 checkpoint), add the tilted walking view with 3D buildings (`fill-extrusion` on the `building` source-layer, `render_height`).
- **Muse** via one adapter (`src/features/muse/client.ts`) built on the `openai` npm package with an explicit `baseURL` and `apiKey`. See `docs/muse-api.md`.
- **Images**: `sharp` (npm) resizes generated images. ffmpeg is not installed; Reels clips are chosen under 4 MB, or ffmpeg is installed in Phase S with `winget install Gyan.FFmpeg`.
- **Seed tooling**: `tsx` runs scripts; `@faker-js/faker` is pinned at `10.6.0` (ESM-only).
- **Vitest** for pure logic, **Playwright** (`@playwright/test` 1.65.0) for the demo-flow smoke test.
- **Scaffold**: `create-next-app .` refuses a non-empty folder, so the app is scaffolded into an empty temp folder and copied in (plan S3). `next@15` resolves to 15.5.29.
- **Deploy: Vercel preview from the CLI.** The Vercel project `out-here` is linked locally (`.vercel/`) but not connected to GitHub, so pushing a branch does not deploy it. After each milestone push run `bash scripts/deploy-requests.sh run overnight` (it runs `vercel deploy --yes`, a preview). Never `vercel deploy --prod`; the humans promote the final preview at handoff. Teammates request deploys of their branches by commenting `DEPLOY <branch>` on pinned issue #4. Details: `docs/DEPLOYS.md`.
- **Platform**: Windows 11. Use `powercfg`, `winget` (Phase S only), and Claude in Chrome (`claude --chrome`) for the browser.
- New dependencies: only those above plus small, well-known UI helpers (`clsx`, `lucide-react`, `zod`, `date-fns`, `framer-motion`). Anything else → log it in `docs/DECISIONS.md` with a reason first.

### Where this differs from the original kit (from plan section 2)
| Kit said | Use instead | Why |
|---|---|---|
| Leaflet + CARTO tiles | `maplibre-gl` (6.18.0) + OpenFreeMap Positron | CARTO now requires a key |
| `create-next-app@15` into the repo | Scaffold into an empty temp folder, then copy in | `create-next-app .` refuses a non-empty folder |
| Realtime by Postgres Changes on tables with permissive RLS | Server-sent Broadcast; RLS on with no anon policies | With no login, a permissive anon SELECT exposes every row, including friends-only fields and locations |
| Legacy anon / service-role keys | Same env names, filled with `sb_publishable_...` / `sb_secret_...` | Legacy keys are deprecated by end of 2026 |
| `caffeinate`, `pmset`, `brew`, desktop-app browser pane | `powercfg`, `winget`, Claude in Chrome | This is Windows 11 |
| Reels and images via ffmpeg | `sharp` for images; Reels clips under 4 MB | ffmpeg is not installed |
| Vercel GitHub integration deploys every push | `vercel deploy --yes` from this laptop | The Vercel login cannot see the GitHub repo |

## Folder ownership
Every folder has exactly one owner. When the main agent runs subagents in parallel, each subagent gets **one owner area** and must not edit outside it. The main agent (integrator) owns all shared areas and is the only one that changes contracts.

| Area (owner) | Paths | Contents |
|---|---|---|
| **core** (main agent) | `src/shared/**`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `supabase/**`, `scripts/**`, `docs/**`, `tests/e2e/**`, root config files, `.claude/**` | types, API contracts, schema + seed, app shell, e2e test, docs |
| **map** | `src/features/map/**`, `src/app/(map)/**` | map, pins, Friends/Explore toggle, quest sheet, "I'm free" composer UI, suggestion cards, invite UI |
| **muse** | `src/features/muse/**`, `src/app/api/muse/**` | Muse client, prompts, schemas, plan pipeline, travel/time-fit, mock mode, eval fixtures |
| **data** | `src/features/data/**`, `src/app/api/(core)/**` | Supabase clients, DataStore (supabase + memory impls), API routes for quests/availability/invites/crews, realtime hooks, demo user switcher |
| **memories** | `src/features/memories/**`, `src/app/(memories)/**` | photo prompt, crew album, "do this again", daily quest, streaks, Wrapped |
| **facebook** | `src/features/fb/**`, `src/app/(fb)/**` | Facebook base: shell (top bar, left nav, right rail, mobile bottom bar), Feed, Stories, Profile, Friends, Notifications, Groups (with the Hangouts tab), Messenger, Events, Search, Marketplace, Reels |
| **ui kit** (map owns, others import) | `src/features/ui/**` | Facebook-style primitives: Button, Sheet, Avatar, Chip, Card, PhoneFrame |
| **config** (main agent) | `src/config/**` | `brand.ts`: wordmark name and logo, so one edit swaps them |

Cross-area imports go **only** through each area's `index.ts` barrel. Never deep-import another area's internals.

## Shared contracts — `src/shared/`
Created first, before any feature work. Feature code imports types from here; never redefine them.

```ts
// src/shared/types.ts
export type ID = string;
export type LatLng = { lat: number; lng: number };

export type Profile = {
  id: ID; name: string; avatarUrl: string; bio: string;
  interests: string[]; budgetMax: number; home: LatLng; isDemoUser: boolean;
};

export type Availability = {            // an "I'm free" signal
  id: ID; userId: ID; text: string;      // raw text the user typed
  startsAt: string; endsAt: string;      // ISO
  location: LatLng; intent: MuseIntent | null; createdAt: string;
};

export type QuestStatus = 'open' | 'full' | 'live' | 'done';
export type Quest = {
  id: ID; hostId: ID; title: string; emoji: string;
  category: 'food' | 'music' | 'sports' | 'study' | 'thrift' | 'art' | 'outdoors' | 'games' | 'other';
  description: string; venueName: string;
  location: LatLng;          // exact — only returned to members
  approxLocation: LatLng;    // ~200 m fuzz — returned to everyone else
  startsAt: string; endsAt: string;
  capacity: number; memberIds: ID[]; priceMax: number; tags: string[];
  status: QuestStatus; isPublic: boolean; createdAt: string;
};

export type Invite = {
  id: ID; fromId: ID; toId: ID; questId: ID | null; suggestionTitle: string;
  message: string; status: 'pending' | 'accepted' | 'declined'; createdAt: string;
};

export type Crew = {                     // forms after a hangout; powers "do this again"
  id: ID; name: string; memberIds: ID[]; originQuestId: ID;
  sharedPrefs: string[]; lastHangoutAt: string;
};

export type Memory = {
  id: ID; crewId: ID; questId: ID; uploaderId: ID;
  photoUrl: string; caption: string; createdAt: string;
};

export type DailyQuest = { date: string; prompt: string; emoji: string };
export type DailyEntry = { date: string; userId: ID; photoUrl: string; verified: boolean | null; museNote: string };

// ---- Muse ----
export type MuseIntent = {
  activities: string[];          // ["food", "dumplings"]
  budgetMax: number | null;
  windowStart: string; windowEnd: string;   // ISO, resolved from "30 min", "before 7"
  maxWalkMinutes: number | null;
  wantsFriends: boolean; openToNewPeople: boolean;
  vibe: string | null;           // "chill", "loud", "low-key"
};

export type PlanSuggestion = {
  kind: 'join_quest' | 'friend_hang' | 'new_quest';
  questId: ID | null; friendIds: ID[];
  title: string; emoji: string;
  reason: string;                // plain language, 1–2 sentences, cites real shared interests/times
  bridge: string | null;         // "Maya's going too" — only from public/shared info
  startsAt: string; travelMinutes: number; fitsWindow: true;   // non-fitting suggestions are dropped by code
  seatsLeft: number | null; inviteDraft: string | null;
};

export type MusePlan = { intent: MuseIntent; suggestions: PlanSuggestion[]; summary: string };
```

```ts
// src/shared/api.ts  — request/response contracts for every route
// GET  /api/quests?lat&lng&radiusM&viewerId          -> { quests: Quest[] }     (approxLocation unless member)
// POST /api/quests                     body: Omit<Quest,'id'|'memberIds'|'status'|'createdAt'|'approxLocation'> -> { quest }
// POST /api/quests/:id/join            body: { userId, withFriendId? }  -> { quest, seatsLeft }   (409 if full)
// POST /api/quests/:id/leave           body: { userId }                 -> { quest, seatsLeft }
// POST /api/quests/:id/complete        body: { userId }                 -> { quest, crew }        (host only; creates/updates crew)
// POST /api/availability               body: { userId, text, startsAt, endsAt, location } -> { availability }
// GET  /api/friends/:userId/availability                                -> { items: (Availability & { friend: Profile })[] }
// GET  /api/users                                                       -> { users: Profile[] }   (demo switcher)
// POST /api/invites                    body: { fromId, toId, questId, suggestionTitle, message } -> { invite }
// POST /api/invites/:id/respond        body: { status: 'accepted'|'declined' } -> { invite, quest? } (accept auto-joins)
// GET  /api/crews?userId                                                -> { crews: Crew[] }
// POST /api/memories                   multipart: photo, crewId, questId, uploaderId -> { memory }
// GET  /api/memories?crewId                                             -> { memories: Memory[] }
// GET  /api/daily?date / POST /api/daily/entry                          -> DailyQuest / { entry }
// GET  /api/me/:userId/streak                                           -> { weeks: number, thisWeekDone: boolean }
// POST /api/muse/plan                  body: { userId, text, location, now? } -> MusePlan
// POST /api/muse/regroup               body: { crewId, now? }           -> { suggestion: PlanSuggestion, message: string }
// POST /api/muse/create-quest          body: { userId, text, location } -> { draft: Partial<Quest>, pitch: string }
// POST /api/muse/caption               body: { questId, crewId }        -> { caption: string }
// POST /api/muse/daily                 body: { date }                   -> DailyQuest
// POST /api/muse/verify-photo          body: { date, photoUrl }         -> { verified: boolean, note: string }
// POST /api/muse/wrapped               body: { userId, month }          -> { cards: { title: string; body: string; stat?: string; photoUrl?: string }[] }
```
Every route validates input with **zod** and returns `{ error: string }` with a 4xx on bad input. All errors are JSON.

## Identity (no login)
- The active persona is per tab: `?as=<handle>` is stored in `sessionStorage` and sent on every API call as an `x-persona` header. Route handlers read the viewer from that header.
- Two tabs in one Chrome profile can therefore be Alex and Maya at the same time. Never use a cookie for the persona: it would make both tabs the same person.
- The switcher (avatar menu) is visibly a demo control.

## Data access and realtime
- **The browser never queries Supabase tables.** All reads and writes go through Next route handlers, which use the secret key on the server and apply the persona's visibility rules (`canSee`).
- **RLS is enabled on every table with no anon policies**, so the publishable key reads nothing. Say this honestly in the docs.
- **Realtime is server-sent Broadcast.** After every mutation the route handler sends a Supabase Broadcast on a public channel. Payloads carry ids and counts only, never profile fields or locations; clients refetch through the API. Channel names and payloads live in `docs/REALTIME.md`:
  - `quest:<id>` `{seatsLeft, memberCount}`
  - `user:<id>` `{type:"notification"|"invite"|"message", id}`
  - `thread:<id>` `{messageId}`
  - `presence:online` (Presence)
  - `post:<id>` `{reactions, comments}`

## Data layer
- `DataStore` interface in `src/features/data/store.ts` with two implementations:
  - `SupabaseStore` — used when `NEXT_PUBLIC_SUPABASE_URL` + keys are present.
  - `MemoryStore` — seeded in-process store, used whenever Supabase env vars are absent, which is always true inside builder worktrees. Live updates across tabs use `BroadcastChannel`. The demo must use Supabase.
- Realtime hooks exported for UI: `useQuests(viewerId)`, `useQuest(id)`, `useFriendAvailability(userId)`, `useInvites(userId)`, `useCrews(userId)`. They subscribe to the Broadcast channels above and refetch through the API.
- Join must be atomic (Postgres function `join_quest(quest_id, user_id)` that checks capacity in one transaction) — the live "last seat" moment must never double-book. `join_quest` is the only way to take a seat.

## Environments and databases
- **Two Supabase projects.** `out-here-dev` takes every test, verifier run, and builder experiment. `out-here-demo` holds only seed data; the overnight run touches it only through `npm run seed:demo`, at milestones and at handoff.
- `.env.local` holds both sets of variables (demo names unsuffixed, dev names with `_DEV`). `DATA_TARGET=dev|demo` picks one; Vercel sets `demo`.
- **Builders** run with `MUSE_MOCK=1`, no secrets, MemoryStore, and their own port `PORT=31xx` (xx is the builder number). Only the main session runs against `out-here-dev` and real Muse.
- **Database URLs.** Migrations and the seed use the **session pooler**, port 5432 (`SUPABASE_DB_URL_DEV` for dev, `SUPABASE_DB_URL` for demo). Runtime uses supabase-js over HTTPS, so there is no transaction-pooler or prepared-statement issue.
- **Secrets for CLIs.** Scripts that need secrets load them with `node --env-file=.env.local` inside npm scripts (`npm run seed`, `npm run db:migrate:dev`, `npm run eval:muse`). The agent runs the npm script and never sees a value.
- **Times.** Store `timestamptz`. Render in `America/Los_Angeles`, since the demo is in Menlo Park.

## Database (Supabase) — `supabase/migrations/0001_init.sql`
Out Here tables (kit, unchanged): `availability`, `quests`, `quest_members(quest_id, user_id, joined_at, via_friend_id)`, `invites`, `crews`, `crew_members`, `memories`, `daily_quests`, `daily_entries`.

Facebook base, in the same first migration so Out Here and Facebook share one graph:
- `profiles`: extended with `handle`, `cover_url`, `school`, `hometown`, `current_city`, and `field_visibility jsonb`. Visibility values are `public | friends | list:<uuid> | only_me`. One shared function, `canSee(viewer, owner, audience)`, is used by posts, profile fields, availability, and albums.
- `friendships`: one row per pair, with `status pending|accepted`, `requester_id`, and `created_at`.
- `friend_lists` and `friend_list_members`.
- `groups` and `group_members`, with role.
- `quests.group_id`: nullable; a public Group hangout sets it.
- `events` and `event_rsvps`, with `going|interested|invited`.
- `posts`: `target_type profile|group|event`, `audience`, and `media text[]`.
- `comments` (`parent_id`), `reactions` (`type` from the 7), `stories`.
- `threads`, `thread_members`, and `messages`.
- `notifications`: recipient, type, actor, object_type, object_id, read_at.
- `listings` and `reels`, created empty in FB-P0 so later surfaces need no migration.
- `muse_runs`: route, model, latency_ms, input_hash, output jsonb, and tokens. This is the "why did Muse suggest this" log and the Q&A evidence for "AI does real work". It never stores keys.

Storage bucket `memories` on both projects, created by the migrate script with the server key. **RLS: enabled on every table, no anon policies**; all access goes through route handlers with the secret key.

## Seed — `scripts/seed.ts` (+ same JSON used by MemoryStore)
- **Deterministic**: `faker.seed(42)`. Faker supplies only ids, timestamps, and counts.
- **Persona content** (bios, about 300 posts, comments, 20 threads, 30 listings) is generated **once** with `muse-ember-1.0` into `supabase/seed-content.json`, which is committed. The seed reads that file, so it is deterministic and offline.
- **People:** about 60 fictional young adults near Menlo Park, including the 8 personas below. Alex has few local friends; Maya is Alex's college friend.
- **Friend circles:** Alex's college friends, Alex's new coworkers, Maya's roommates, a climbing gym crowd, a local-shows crowd, and a few bridges between them. Pending friend requests run both ways.
- **Groups:** 12, including "Menlo Park New Grads", "Bay Area Local Shows", "Pickup Volleyball Peninsula", "Peninsula Thrift Walks", and "Cheap Eats South Bay".
- **Out Here demo story:** the 15 quests below, with explicitly three candidates for Alex's "hungry, 40 min, under $15": the dumpling quest, which fits (9 min walk, $12, 2 seats left); a ramen quest that is too far (28 min walk); a sushi quest over budget ($26). Changing to 15 minutes must leave only a boba quest at 4 min walk, or "no fit". The dumpling quest belongs to "Cheap Eats South Bay", so it shows on that Group's Hangouts tab.
- **Faces:** `scripts/gen-images.ts` (`npm run gen:images`) calls `muse-image-1.0` for about 60 portraits and 40 content images. It caches by a hash of the prompt and never regenerates existing files. Hard cap: 150 images, about $1.50. `sharp` resizes portraits to 256 px WebP (about 30 KB) and content images to 800 px WebP (about 80 KB). Prompts ask for ordinary fictional young adults of varied backgrounds and never name a real person. Fallback on a 400 error: DiceBear CC0 `notionists`. Do not use thispersondoesnotexist.com, generated.photos (its terms forbid public repos and apps), or stock photos of real people.
- **`npm run seed:demo`** regenerates times relative to now, so "starts in 25 min" is true at 10:45 AM.
- **Demo center: Meta HQ, Menlo Park — 1 Hacker Way (37.4847, -122.1477)**, where the judges will see the demo. Set once in `src/shared/demo.ts` (`DEMO_CENTER`, plus `DEMO_AREA_LABEL = "Menlo Park"`). If the team posts a different spot on the board (e.g. a specific building), change only this constant and re-seed.
- **Map framing:** initial zoom shows the campus, Bayfront Park to the north, Belle Haven, and the Willow Rd corridor toward downtown Menlo Park / Palo Alto. Walking speed stays 80 m/min, and suggestions over 25 min of walking are dropped unless the user asks for farther.
- **8 personas** — young adults new to the Bay Area (new grads, interns, a Stanford grad student, a barista, a freelance designer). **Alex** (you, the demo driver, 3 weeks into a new job, knows almost nobody), **Maya** (Alex's best friend from college who just moved here; free after work 5:15–6:00), plus 6 others with distinct interests/budgets (indie music, thrifting, volleyball, film photography, boba, board games, climbing, K-food). Alex and Maya both like dumplings + local bands.
- **~15 quests within ~2 km of DEMO_CENTER**, times relative to "now" so the demo always works. Use **fictional venue names** (e.g. "Dumpling Den", "Hacker Way Courts", "Willow Thrift Co.") — don't attach made-up prices or events to real businesses, and don't present anything as an official Meta event. Real public places (Bayfront Park) are fine as locations. Quests: 🥟 dumpling hangout at Dumpling Den (2 seats left, starts in 25 min, $12), 🏐 pickup volleyball (needs 1), 🧥 thrift walk, 📚 silent study sprint, 🎸 local-band show pregame, 🖼️ art walk, 🧋 boba + sketching, 🎲 board games, 🌅 Bayfront Park sunset walk, 🍜 pho run, 📸 film photo walk, 🧗 bouldering intro, 🌮 taco truck crawl, 🎮 Smash night, 🏃 easy 5K along the bay trail.
- **History**: 3 past hangouts for Alex with crews, photos (placeholder images in `public/seed/`), and 6 weeks of streak data so Memories and Wrapped look real.
- Seed times are generated relative to `now` at seed time AND the MemoryStore regenerates on boot, so a demo at 10 AM still shows "starting soon" quests.

## Muse pipeline (`src/features/muse/`)
1. **Parse** (`parseIntent`, fast model): free text + now → `MuseIntent` (structured output / JSON mode, validated with zod; one retry on invalid JSON).
2. **Candidates** (pure code, `candidates.ts`): quests that are open, within window, within walk limit, under budget; friends whose availability overlaps the window; compute `travelMinutes = haversine × 1.3 / 80 m/min` (`travel.ts`). Drop anything that can't fit. **Never let the model invent quests, people, times or prices.**
3. **Rank + explain** (`rankAndExplain`, smart model): given intent, profiles' shared interests, and candidate list (ids only from the list) → top 2–3 with `reason`, optional `bridge`, `inviteDraft`. Must reference only ids present in candidates; code rejects anything else.
4. **Validate** (code): drop unknown ids, recompute `travelMinutes`/`seatsLeft` from data, enforce `fitsWindow`.
5. Latency: the kit's < 4 s target is not met by Spark at `low` effort (measured 6.4 s; Ember `minimal` parse was 1.2 s). Parse with Ember (`minimal`), rank and explain with Spark at `minimal`, measure during M1, and record the numbers in `docs/DECISIONS.md`. If it still feels slow, try Ember for ranking and log that result too. Stream the UI and show the skeleton state with "Muse is checking who's free…".
6. Log every Muse call to `muse_runs` (route, model, latency, input hash, output, tokens; never keys).
- Mock mode (`MUSE_MOCK=1` or no `MUSE_API_KEY`): deterministic heuristic implementation of each step so UI and tests work offline. Clearly label mock responses in dev (`[mock]` prefix in `summary`). **The demo and the deployed build must run on real Muse.**
- Keep prompts in `src/features/muse/prompts/*.ts` as exported template functions, and eval fixtures in `src/features/muse/fixtures/*.json` (input text → expected properties) run by Vitest against mock, and by `npm run eval:muse` against the real API.

## UI direction
- **The Facebook web app is the entry point**, not a phone frame. Layout follows `docs/FB_SPEC.md` at 1440 px desktop and 390 px mobile. Out Here is a tab in the top bar, the mobile bottom bar, and the left nav. Starting tokens (confirm against the spec): background `#F0F2F5`, white cards with an 8 px radius, blue `#0866FF`, secondary text `#65676B`, 56 px top bar, 40 px feed avatars, Segoe UI system font stack.
- **Brand.** A neutral "facebook"-style wordmark in `#0866FF` and `lucide-react` icons. Do not copy Facebook's logo, icon, or emoji files (Meta's brand page says the logo must be "complete and unaltered"). Name and logo live in `src/config/brand.ts`, so one edit swaps them if an organizer approves the real logo. Footer: "Demo. Fictional people. Images generated with Meta Muse Image."
- **Inside the Out Here tab at mobile width**, keep the kit's full-screen map design: map fills the screen; bottom sheet for composer / suggestions / quest detail; Out Here sub-views Map · Memories · Me.
- No `window.alert`, `confirm`, or `prompt` anywhere in the app. They hang Claude in Chrome.
- Pins: emoji in a white circle + small seat badge ("2 left"). Friend availability = avatar pins with a green ring and a time label ("free till 6").
- Every Muse output shows a small "✨ Muse" label so judges see where the AI is.
- Motion: seat badge pulses when it changes live; joining animates the avatar onto the pin.
