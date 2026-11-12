# 10 — Architecture, folder ownership, contracts

## Stack (fixed — do not swap)
- **Next.js 15 (App Router) + TypeScript (strict) + Tailwind CSS**, npm.
- **Supabase**: Postgres, Realtime (seats, availability, invites), Storage (photos). `@supabase/supabase-js` v2.
- **Leaflet + react-leaflet** (version compatible with the React version Next installs) with **CARTO Positron/Voyager** tiles (no API key). Leaflet must be client-only (`dynamic(..., { ssr: false })`).
- **Muse** via one adapter (`src/features/muse/client.ts`). See `docs/muse-api.md`.
- **Vitest** for pure logic, **Playwright** for the demo-flow smoke test.
- Deploy: **Vercel** (GitHub integration builds every pushed branch).
- New dependencies: only those above plus small, well-known UI helpers (`clsx`, `lucide-react`, `zod`, `date-fns`, `framer-motion`). Anything else → log it in `docs/DECISIONS.md` with a reason first.

## Folder ownership
Every folder has exactly one owner. When the main agent runs subagents in parallel, each subagent gets **one owner area** and must not edit outside it. The main agent (integrator) owns all shared areas and is the only one that changes contracts.

| Area (owner) | Paths | Contents |
|---|---|---|
| **core** (main agent) | `src/shared/**`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `supabase/**`, `scripts/**`, `docs/**`, `tests/e2e/**`, root config files, `.claude/**` | types, API contracts, schema + seed, app shell, e2e test, docs |
| **map** | `src/features/map/**`, `src/app/(map)/**` | map, pins, Friends/Explore toggle, quest sheet, "I'm free" composer UI, suggestion cards, invite UI |
| **muse** | `src/features/muse/**`, `src/app/api/muse/**` | Muse client, prompts, schemas, plan pipeline, travel/time-fit, mock mode, eval fixtures |
| **data** | `src/features/data/**`, `src/app/api/(core)/**` | Supabase clients, DataStore (supabase + memory impls), API routes for quests/availability/invites/crews, realtime hooks, demo user switcher |
| **memories** | `src/features/memories/**`, `src/app/(memories)/**` | photo prompt, crew album, "do this again", daily quest, streaks, Wrapped |
| **ui kit** (map owns, others import) | `src/features/ui/**` | Facebook-style primitives: Button, Sheet, Avatar, Chip, Card, PhoneFrame |

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

## Data layer
- `DataStore` interface in `src/features/data/store.ts` with two implementations:
  - `SupabaseStore` — used when `NEXT_PUBLIC_SUPABASE_URL` + keys are present.
  - `MemoryStore` — seeded in-process store, used when Supabase env is missing. Live updates across tabs use `BroadcastChannel`. This keeps the build moving if Supabase isn't configured; the demo must use Supabase.
- Realtime hooks exported for UI: `useQuests(viewerId)`, `useQuest(id)`, `useFriendAvailability(userId)`, `useInvites(userId)`, `useCrews(userId)`.
- Join must be atomic (Postgres function `join_quest(quest_id, user_id)` that checks capacity in one transaction) — the live "last seat" moment must never double-book.

## Database (Supabase) — `supabase/migrations/0001_init.sql`
Tables: `profiles`, `friendships(user_id, friend_id)`, `availability`, `quests`, `quest_members(quest_id, user_id, joined_at, via_friend_id)`, `invites`, `crews`, `crew_members`, `memories`, `daily_quests`, `daily_entries`. Enable Realtime on `quests`, `quest_members`, `availability`, `invites`. Storage bucket `memories` (public read for demo). RLS: permissive policies for the demo (no auth) — note this honestly in docs.

## Seed — `supabase/seed.ts` (+ same JSON used by MemoryStore)
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
5. Latency target: < 4 s total. Show a streaming/skeleton state in the UI with "Muse is checking who's free…".
- Mock mode (`MUSE_MOCK=1` or no `MUSE_API_KEY`): deterministic heuristic implementation of each step so UI and tests work offline. Clearly label mock responses in dev (`[mock]` prefix in `summary`). **The demo and the deployed build must run on real Muse.**
- Keep prompts in `src/features/muse/prompts/*.ts` as exported template functions, and eval fixtures in `src/features/muse/fixtures/*.json` (input text → expected properties) run by Vitest against mock, and by `npm run eval:muse` against the real API.

## UI direction
- Mobile-first, shown inside a **phone frame** on desktop (so the judges' laptop demo looks like the Facebook app). Facebook blue `#0866FF`, white surfaces, rounded 12–16 px cards, system font stack.
- Top: Facebook-style tab header "Out Here". Map fills the screen; bottom sheet for composer / suggestions / quest detail. Bottom nav: Map · Memories · Me.
- Pins: emoji in a white circle + small seat badge ("2 left"). Friend availability = avatar pins with a green ring and a time label ("free till 6").
- Every Muse output shows a small "✨ Muse" label so judges see where the AI is.
- Motion: seat badge pulses when it changes live; joining animates the avatar onto the pin.
