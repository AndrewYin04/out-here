# MVP build plan, iteration 1: Facebook base + Out Here, one overnight run

The run book for one Claude Code session on Andrew's Windows laptop. It merges two
sources:

- the Facebook-clone brief;
- the Out Here overnight kit on branch `setup/overnight-agent`: `docs/MASTER_PROMPT.md`,
  `.claude/rules/*`, `scripts/board.sh`, and `scripts/preflight.sh`.

**Where this file overrides the kit.** Where they disagree, this file wins, and Phase S
edits the kit's files so nothing contradictory is left for the overnight session.

**Fact sources.** Facts were checked 2026-11-12 at the URLs given. Muse results marked
"measured" came from real calls made from this laptop that night.

---

## 1. What we are building and why

**Event.** Meta "Facebook - Closer Together AI Hackathon 2026"
(https://devpost.team/meta/hackathons/4058).

- Submission due **Fri Nov 13, 10:30 AM PT (12:30 PM CST)**: a Devpost project page
  and a **public GitHub repo**; video optional.
- Judging: **5-minute demo plus 3 minutes of Q&A**, from 10:45 AM PT.
- Scoring weights:
  - AI Integration, 30%.
  - Product Thinking and User Impact, 25%.
  - Execution and Demo, 25% ("no unnecessary mockups").
  - Originality and Cohesion, 20%.
- "A Muse Model (Spark/Wonder/Ember) must power the core AI experience."

**Product.** A working Facebook web app with fictional people. Out Here ships inside it
as a new Facebook tab.

- Out Here is a live map of nearby plans you can join right now. Its loop:
  **I'm free → Muse finds the plan → join live → photo together → do it again**.
- Scope, tiers, safety model, and pitch: `.claude/rules/00-mission.md`.
- Facebook base: section 5 of this file.
- Build on **Facebook surfaces only**. No Instagram, Threads, or WhatsApp UI.

**Why the Facebook base matters for scoring.** Product Thinking asks whether the
feature "fits naturally on Facebook". A judge who sees Out Here invites arrive as
Facebook notifications and Messenger messages, and hangouts listed on a Group page,
sees that fit without being told.

**Priority when time runs short.** Out Here P0 inside a believable Facebook shell is
the demo. Facebook surfaces the demo does not pass through come after it.

---

## 2. Verified facts the run depends on

**Muse key** (measured 2026-11-12 ~01:20 PT, using `META_API_KEY` from
`brawlcam.env`):

- `GET https://api.meta.ai/v1/models` returned 200. Models listed: muse-ember-1.0,
  muse-wonder-1.0, sam-3.1, muse-spark-1.3-contributor, muse-voice-transcribe-1.0,
  muse-spark-1.3, muse-image-1.0, muse-spark-1.2-contributor, muse-spark-1.2,
  muse-spark-1.1.
- `muse-spark-1.3`, `reasoning_effort:"low"`, strict JSON schema: returned 200 in
  **6.4 s**. It produced a correct pick, and 490 of its 586 output tokens were
  reasoning.
- `muse-ember-1.0`, `reasoning_effort:"minimal"`, strict JSON schema: returned 200 in
  **1.2 s**. It parsed "hungry, got like 40 min, under $15" to
  `{activity:"eat", minutes:40, budgetUsd:15}`.
- `muse-image-1.0`: returned 200 in **8.3 s**. The output was a realistic fictional
  portrait at 1600x1600, a 504 KB WebP, so the seed must resize to 256 px and about
  30 KB.
- What this means for the build:
  - Parse with Ember (minimal). Rank and explain with Spark at `minimal`, measured
    during M1.
  - Stream the UI and show the "Muse is checking who's free…" skeleton.
  - The kit's "< 4 s total" target is not met by Spark at low effort; measure and
    record it in `docs/DECISIONS.md`.

**Muse API rules** (https://dev.meta.ai/docs):

- Base URL `https://api.meta.ai/v1`, `Authorization: Bearer`. It is OpenAI-compatible;
  use the `openai` npm package with an explicit `baseURL` and `apiKey`.
- Structured output:
  `response_format:{type:"json_schema", json_schema:{name, strict:true, schema}}`.
  Strict mode requires a root object, `additionalProperties:false`, every key listed
  in `required`, and no `oneOf`/`allOf`.
- `tool_choice` accepts only `"auto"`.
- These parameters return HTTP 400: `stop`, `n>1`, `logit_bias`, `logprobs`,
  `modalities`, `reasoning_effort:"none"`.
- Long non-streaming calls can return 504.
- Vision: `image_url` parts with an https URL or a data URL. This makes the Daily Quest
  photo check possible.
- Images: `POST /v1/images/generations` with model `muse-image-1.0`, $0.01 each, 150
  requests per minute. A policy block returns 400 `content_policy_violation`.
- Prices per 1M tokens:
  - Spark: $1.25 in / $4.25 out.
  - Ember: $0.10 in / $0.50 out.
  - Wonder: $4 in / $20 out (not used).
- Billing is pay-as-you-go. This key is billed to whoever owns it.

**Stack changes from the kit's `10-architecture.md`:**

| Kit says | Use instead | Why |
|---|---|---|
| Leaflet + CARTO tiles "no API key" | `maplibre-gl` (6.18.0) + OpenFreeMap style `https://tiles.openfreemap.org/styles/positron`, attribution "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" | CARTO now requires a key; an unkeyed tile request returned an "API KEY REQUIRED" image (github.com/CartoDB/basemap-styles) |
| `create-next-app@15` into the repo | Scaffold into an empty temp folder, then copy in (S4) | `create-next-app .` refuses a non-empty folder |
| Realtime by Postgres Changes on tables with permissive RLS | Server-sent Broadcast; RLS on with no anon policies (section 4) | With no login, a permissive anon SELECT exposes every row, including friends-only fields and locations |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Keep these names, but fill them with the new `sb_publishable_...` / `sb_secret_...` keys | Legacy keys are deprecated by end of 2026 (supabase.com/docs/guides/api/api-keys) |
| `caffeinate`, `pmset`, `brew`, desktop-app browser pane | `powercfg`, `winget`, Claude in Chrome (`claude --chrome`) | This is Windows 11 |
| Reels and images via ffmpeg | `sharp` (npm) for images. Reels clips are chosen under 4 MB, or ffmpeg is installed in Phase S with `winget install Gyan.FFmpeg`. | ffmpeg is not installed |

Versions on 2026-11-12: `next@15` resolves to 15.5.29, `@supabase/supabase-js` is
2.119.0, `@playwright/test` is 1.65.0, and `@faker-js/faker` is 10.6.0 (ESM-only; pin
it).

**Map, in two steps.** One map stack: `maplibre-gl` with the OpenFreeMap Positron
style above. No Leaflet, react-leaflet, or CARTO anywhere.

1. M2: the overhead Menlo Park map centered on `DEMO_CENTER`, with quest pins and live
   seat counts. MapLibre touches `window`, so the map component is client-only and
   imports `maplibre-gl/dist/maplibre-gl.css`.
2. M4, only after the M3 checkpoint (join works live on two devices): a tilted walking
   view (pitch about 60) with 3D buildings, a `fill-extrusion` layer on the
   OpenFreeMap `building` source-layer using `render_height`. It is the first thing
   cut if M4 runs late.

**Claude Code behaviour for an unattended Windows run** (https://code.claude.com/docs/en/):

- **Platform.** Native Windows has no sandbox. Claude in Chrome does not work under
  WSL, so the run uses native Windows.
- **Usage limits.**
  - An **interactive** terminal session on a subscription waits for a usage-limit reset
    and continues, at most 3 times in a row.
  - A **Remote Control** session, a background session, and `claude -p` do **not**
    wait, and workflow agents in them fail at the limit.
  - So Phase N runs interactive, with no `--remote-control`. Watch it from your phone
    through the board issue instead.
- **Auto mode.**
  - It blocks production deploys and database migrations by default.
  - It drops broad allow rules for `npm`, `npx`, and `node`.
  - After 3 consecutive or 20 total blocks it pauses and prompts.
  - Its `autoMode` exceptions are read **only from user settings**
    (`~/.claude/settings.json`), never from the project's `.claude/settings.json`.
- **Workflow agents.**
  - A Workflow agent's prompt never counts as user intent for the classifier.
  - The first Workflow launch in auto mode asks for approval once; a human must answer
    it in Phase S.
- **Prompt handling.** A background subagent's permission prompt surfaces in the main
  session and waits. A `PermissionRequest` hook can deny it automatically instead.
- **Ending a turn.**
  - A turn that ends on an API error fires `StopFailure`, which cannot block.
  - `/loop` and session crons (CronCreate) fire only while the session is open and
    idle.
  - Use both: `/loop` for pacing, and a 30-minute cron as a backstop if a turn dies.
- **Worktrees.** Subagent worktrees branch from the remote default branch unless
  `worktree.baseRef` is `"head"`. A worktree holds only tracked files, so it has no
  `.env.local` and no `node_modules`.
- **Permission rules and Windows.** `Bash(...)` deny rules and Bash-matcher hooks do not
  see the PowerShell tool, which is on by default on Windows.
- **Chrome connection.** Claude in Chrome can drop when the extension's service worker
  idles, and reconnecting needs a human (`/chrome` → Reconnect). Chrome checks are
  therefore a bonus overnight. Playwright is the gate.

---

## 3. Resources and their state on this laptop

| Resource | State | Who does what |
|---|---|---|
| Node 22.17, npm 11.5, git 2.56, Docker 29, bash 5.3 | ✅ installed | Nothing to do |
| GitHub | ✅ `gh` logged in as AndrewYin04 (scopes repo, read:org); SSH push to github.com works | Human: set branch protection on `main`; add teammates as collaborators |
| Muse key | ✅ works (section 2). It lives in `brawlcam.env` as `META_API_KEY`. | Human: copy it into `.env.local` as `MUSE_API_KEY`; set a spend alert at dev.meta.ai; ask organizers about credits |
| `brawlcam.env` in the repo root | ⚠️ holds 5 keys from another project; only the `*.env` gitignore line keeps it out of a repo that goes public | Human: move it out of the repo after copying the Muse key |
| Supabase | ❌ none | Human: create **two** free projects, `out-here-demo` (deployed demo) and `out-here-dev` (overnight tests). For each, copy the URL, the publishable and secret keys, and the **session pooler** connection string (port 5432) into `.env.local` (the names are in S3). Free plan: 2 projects, 200 Realtime connections, 1 GB storage. |
| Vercel | ❌ not linked; CLI is 48.10 | Human: import `AndrewYin04/out-here` in the Vercel dashboard. Add the demo project's env vars for Production and Preview. Each pushed branch then gets a preview deploy with no token on this laptop. |
| Board (GitHub issue) | ❌ `scripts/board.config` is empty | Human: fill in `TEAM_LOGINS` and `ONCALL`. Candidates from the planning doc: AndrewYin04, alnnguyen, Alwxngn, allyytc, and Rishab's login, which needs confirming. Then run `bash scripts/board.sh init`. |
| jq | ❌ missing; `board.sh` needs it | Human: `winget install jqlang.jq` |
| ffmpeg | ❌ missing | Optional: `winget install Gyan.FFmpeg` |
| Claude Code | 2.1.301; changelog shows 2.1.322 (Nov 10) | Human: `claude update`, then the settings in S3 |
| Chrome + Claude extension | ✅ connected this session | Keep Chrome open; close tabs you need |
| Power | unknown | Human: AC power, and from an admin shell `powercfg /change standby-timeout-ac 0` and `powercfg /change hibernate-timeout-ac 0`. Set "lid close: do nothing" or keep the lid open. Pause Windows Update for 1 day. |

---

## 4. Architecture decisions that close review findings

**1. Identity.**
- No login. The active persona is per tab: `?as=<handle>` is stored in `sessionStorage`
  and sent as an `x-persona` header.
- Two tabs in one Chrome profile can therefore be Alex and Maya at the same time. A
  cookie would make them the same person.
- The switcher is visibly a demo control.

**2. Data access.**
- The browser never queries Supabase tables. All reads and writes go through Next
  route handlers, which use the secret key on the server and apply visibility rules for
  the persona.
- RLS is **enabled on every table with no anon policies**, so the public key reads
  nothing.

**3. Realtime.**
- After every mutation, the route handler sends a Supabase **Broadcast** on public
  channels.
- The payloads carry ids and counts only, never profile fields or locations. Clients
  refetch through the API.
- Channel names and payloads go in `docs/REALTIME.md`:
  - `quest:<id>` `{seatsLeft, memberCount}`
  - `user:<id>` `{type:"notification"|"invite"|"message", id}`
  - `thread:<id>` `{messageId}`
  - `presence:online` (Presence)
  - `post:<id>` `{reactions, comments}`

**4. Two databases.**
- `out-here-dev` takes every test, verifier run, and builder experiment.
- `out-here-demo` holds only seed data. The overnight run touches it only through
  `npm run seed:demo`, at milestones and at handoff.
- `.env.local` holds both sets of variables. `DATA_TARGET=dev|demo` picks one, and
  Vercel sets `demo`.

**5. Store fallback.**
- `MemoryStore` (from the kit) is used whenever Supabase env vars are absent, which is
  always true inside builder worktrees.
- Builders therefore run with `MUSE_MOCK=1`, no secrets, and their own port
  (`PORT=31xx`, where xx is the builder number).
- Only the main session runs against `out-here-dev` and real Muse.

**6. Database URLs.**
- Migrations and the seed use the session pooler, port 5432 (`SUPABASE_DB_URL_DEV` /
  `_DEMO`).
- Runtime uses supabase-js over HTTPS, so there is no transaction-pooler or
  prepared-statement issue.

**7. Times.**
- Store `timestamptz`. Render in `America/Los_Angeles`, since the demo is in Menlo Park.
- The seed generates times relative to now, and `npm run seed:demo` regenerates them so
  "starts in 25 min" is true at 10:45 AM.

**8. Location.** The demo center is the kit's **Meta HQ, 1 Hacker Way, Menlo Park
(37.4847, -122.1477)**, held in `src/shared/demo.ts`.

**9. Brand.**
- Use a neutral wordmark, "facebook"-style blue `#0866FF`, and `lucide-react` icons.
  Do not copy Facebook's logo, icon, or emoji files.
- Meta's brand page says the logo must be "complete and unaltered".
- Name and logo live in `src/config/brand.ts`, so one edit swaps them if an organizer
  approves the real logo.
- Footer: "Demo. Fictional people. Images generated with Meta Muse Image."

**10. Secrets for CLIs.** Claude never reads `.env.local`. Scripts that need secrets
load them with `node --env-file=.env.local` inside npm scripts (`npm run seed`,
`npm run db:migrate:dev`, `npm run eval:muse`). Claude runs the npm script and never
sees a value.

---

## 5. Facebook base scope

The layout follows `docs/FB_SPEC.md`, written in S5, at 1440 px desktop and 390 px
mobile. Out Here is a tab in the top bar, the mobile bottom bar, and the left nav. It
replaces the kit's "phone frame with Map · Memories · Me" as the entry point. At mobile
width Out Here keeps the kit's full-screen map design.

**FB-P0: needed for the demo and for "looks like Facebook"**

- **Shell.**
  - Top bar: search, center tabs (Home, Friends, Out Here, Groups, Marketplace),
    Messenger, notifications with a live badge, and the avatar menu with the persona
    switcher.
  - Left nav, and a right rail with Contacts and live online dots.
  - Mobile bottom bar.
- **Feed.**
  - Stories tray (seeded; the viewer opens).
  - Composer with text and a photo upload to Storage, and an audience picker (public,
    friends, or a friend list).
  - Posts with the 7 reactions (Like, Love, Care, Haha, Wow, Sad, Angry), comments
    with one reply level, and share.
- **Profile.** Cover, avatar, friend count with an avatar stack, an Intro card that
  applies per-field visibility, and Posts, About, Friends, and Photos tabs.
- **Friends.** Requests (Confirm and Delete work), Suggestions ranked by mutual friends,
  All friends, and Friend lists (create, add, remove; "Close friends" is seeded).
- **Notifications.** Friend requests, comments, reactions, and Out Here invites and
  joins. Each one links to its object.
- **Groups.** Group page with Discussion, Members ("N friends are members"), and a
  **Hangouts** tab listing that Group's Out Here quests. Join and leave work.

**FB-P1: after the Out Here P0 checkpoint**

- **Messenger.** `/messages` inbox, plus docked chat windows. Out Here invites also
  arrive as a Messenger message with Accept and Decline. New messages appear within
  2 s for the other persona.
- **Events.** Discover, an event page with Going and Interested and live counts, and
  guest lists showing friends first.
- **Search.** People, Groups, Events, and quests.

**FB-P2**

- Marketplace grid and item page.
- Reels viewer with 6 to 8 vertical clips from Mixkit or Coverr, under 4 MB each,
  listed in `CREDITS.md`.
- Photos tab albums.
- Gaming and Dating are left out of the nav.

**Data model.** Add these to the kit's `supabase/migrations/0001_init.sql` in the same
first migration, so Out Here and Facebook share one graph:

- `profiles`: extend with `handle`, `cover_url`, `school`, `hometown`,
  `current_city`, and `field_visibility jsonb`.
  - The visibility values are `public | friends | list:<uuid> | only_me`.
  - One shared function, `canSee(viewer, owner, audience)`, is used by posts, profile
    fields, availability, and albums.
- `friendships`: one row per pair, with `status pending|accepted`, `requester_id`, and
  `created_at`.
- `friend_lists` and `friend_list_members`.
- `groups` and `group_members`, with role.
- `quests.group_id`: nullable; a public Group hangout sets it.
- `events` and `event_rsvps`, with `going|interested|invited`.
- `posts`: `target_type profile|group|event`, `audience`, and `media text[]`.
- `comments` (`parent_id`), `reactions` (`type` from the 7), `stories`.
- `threads`, `thread_members`, and `messages`.
- `notifications`: recipient, type, actor, object_type, object_id, read_at.
- `listings` and `reels`, created empty in FB-P0 so later surfaces need no migration.
- `muse_runs`: route, model, latency_ms, input_hash, output jsonb, and tokens. This is
  the "why did Muse suggest this" log and the Q&A evidence for "AI does real work". It
  never stores keys.

The kit's `availability`, `quests`, `quest_members`, `invites`, `crews`, `memories`,
and `daily_*` tables stay as written. `join_quest` stays the only way to take a seat.

**Seed** (`scripts/seed.ts`, deterministic, `faker.seed(42)`).

- **Persona content.**
  - Persona text (bios, about 300 posts, comments, 20 threads, 30 listings) is
    generated **once** with `muse-ember-1.0` into `supabase/seed-content.json`, which
    is committed. The seed reads that file, so it is deterministic and offline.
  - Faker supplies only ids, timestamps, and counts.
- **People.**
  - About 60 fictional young adults near Menlo Park.
  - They include the kit's 8 personas. Alex has few local friends; Maya is Alex's
    college friend.
- **Friend circles.**
  - Alex's college friends, Alex's new coworkers, Maya's roommates, a climbing gym
    crowd, a local-shows crowd, and a few bridges between them.
  - Pending friend requests run both ways.
- **Groups.** 12, including "Menlo Park New Grads", "Bay Area Local Shows", "Pickup
  Volleyball Peninsula", "Peninsula Thrift Walks", and "Cheap Eats South Bay".
- **Out Here demo story.**
  - The kit's 15 quests.
  - Explicitly three candidates for Alex's "hungry, 40 min, under $15":
    - the dumpling quest, which fits: 9 min walk, $12, 2 seats left;
    - a ramen quest that is too far: 28 min walk;
    - a sushi quest over budget: $26.
  - Changing to 15 minutes must leave only a boba quest at 4 min walk, or "no fit".
  - The dumpling quest belongs to "Cheap Eats South Bay", so it shows on that Group's
    Hangouts tab.
- **Faces.**
  - `scripts/gen-images.ts` calls `muse-image-1.0` for about 60 portraits and 40
    content images.
  - It caches by a hash of the prompt and never regenerates existing files. Hard cap:
    150 images, about $1.50.
  - `sharp` resizes portraits to 256 px WebP (about 30 KB) and content images to
    800 px WebP (about 80 KB).
  - Prompts ask for ordinary fictional young adults of varied backgrounds and never
    name a real person.
  - Fallback on a 400 error: DiceBear CC0 `notionists`.
  - Do not use thispersondoesnotexist.com (now a domain-for-sale page), generated.photos
    (its terms forbid public repos and apps), or stock photos of real people.

---

## 5a. One-sitting resource setup (human + Claude, before Phase S)

Do these in this order. Claude can help with each in chat.

1. Copy the Muse key into `.env.local` as `MUSE_API_KEY`, then move `brawlcam.env` out
   of the repo.
2. Create the two Supabase projects and paste their values into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL` for **demo**;
   - the same four with suffix `_DEV` for **dev**;
   - `MUSE_BASE_URL=https://api.meta.ai/v1`, `MUSE_MODEL_FAST=muse-ember-1.0`,
     `MUSE_MODEL_SMART=muse-spark-1.3`, `MUSE_MODEL_VISION=muse-spark-1.3`, and
     `MUSE_MODEL_IMAGE=muse-image-1.0`.
3. Import the repo in Vercel with the demo values and `DATA_TARGET=demo`.
4. Install jq, fill in `scripts/board.config`, and run `bash scripts/board.sh init`.
5. Protect `main` in GitHub settings. Merge `setup/overnight-agent` into `main`, then
   add this file and merge it too, so the overnight branch starts from both.
6. Set power settings, run `claude update`, and apply the user settings from S3.

---

## 6. Phase S: setup with the human present (target 60 minutes)

Start in Windows Terminal in the repo:
`claude --chrome --permission-mode auto`, then type
`Read MVP-BUILD-PLAN-itr-1.md and run Phase S with me.`

Phase S ends when the dry run (S8) passes. Heavy work that needs no human, such as
image generation and seed content, is queued as the first overnight milestone, not done
here.

### S1. Reconcile the kit with this file

Edit the kit so the overnight session reads one consistent set of rules, and commit on
`overnight` (created from `main`):

- **`.claude/rules/00-mission.md`.** Add "The product is a Facebook web app; Out Here
  is one tab in it", plus the FB tiers from section 5. Under "Explicitly cut", remove
  "DMs/chat, notifications infra": Messenger and notifications are Facebook base
  surfaces now.
- **`.claude/rules/10-architecture.md`.**
  - Apply section 2's stack table and all of section 4.
  - Add the `facebook` owner area `src/features/fb/**` and `src/app/(fb)/**`.
  - Add the data model and seed from section 5.
- **`.claude/rules/20-workflow.md`.**
  - Builders get `PORT=31xx` and `MUSE_MOCK=1` and use MemoryStore.
  - Verification order: main session's checks → `e2e-verifier` → merge.
  - At most 3 builders at once.
- **`.claude/rules/40-safety.md`.**
  - Apply every rule to the PowerShell tool as well as Bash.
  - Allow `winget` only in Phase S.
  - Add: never commit or upload `reference/`.
- **`.claude/settings.json`.**
  - Remove broad `Bash(npm:*)`, `npx:*`, `node:*` (auto mode drops them anyway).
    Allow the exact npm scripts instead: `npm run dev|build|lint|typecheck|test|test:e2e|seed|seed:demo|db:migrate:dev|eval:muse|gen:images`,
    `npx playwright test*`, and `npx tsc --noEmit`.
  - Add `"worktree": {"baseRef": "head"}`. Confirm the key name in
    https://code.claude.com/docs/en/settings.md first.
  - Replace `mcp__Claude_Browser` with the Claude in Chrome tools.
  - Mirror every Bash deny as a `PowerShell(...)` deny.
- **`.gitignore`.** Keep the `*.env` line and the kit's entries. Add `reference/`,
  `.verify/`, `.claude/worktrees/`, and `public/seed/raw/`.
- **`scripts/preflight.sh`.**
  - Replace the macOS checks: `pmset` becomes `powercfg /requests`, and the
    `caffeinate` check becomes a reminder line.
  - Replace `brew` hints with `winget`.
  - Read env names with `grep -o '^[A-Z_]*='`, which matches names only.
- **`docs/muse-api.md`.** Replace the placeholder with section 2's Muse facts and the
  measured latencies.
- **`docs/MASTER_PROMPT.md`.** Add one line at the top: "Read MVP-BUILD-PLAN-itr-1.md
  first; it overrides this file where they differ." Apply section 7's milestone list
  in place of M0 to M7.
- **`README.md`.** Convert it to UTF-8. Add the Facebook-base sentence and the setup
  commands, and keep it current at every milestone (AGENTS.md rule 5).

### S2. User-level settings (only a human can approve these)

Add to `~/.claude/settings.json`, because auto mode ignores `autoMode` in project
settings. Remove it after the hackathon.

```json
"autoMode": {
  "environment": ["$defaults",
    "Source control: github.com/AndrewYin04/out-here",
    "Deploy target: Vercel preview/production for out-here, built from pushes to the overnight branch; hackathon demo, fictional data",
    "Databases: Supabase projects out-here-dev and out-here-demo, fictional seed data only",
    "Trusted APIs: api.meta.ai (Muse)"],
  "allow": ["$defaults",
    "In c:/personal-projects/out-here: npm run db:migrate:dev, npm run seed, npm run seed:demo against the out-here Supabase projects",
    "In c:/personal-projects/out-here: git push origin overnight"]
}
```

Then run `claude auto-mode config` and confirm the entries are listed. Also set these
in `/config`:

- "Continue automatically at usage limit": on.
- Remote Control for all sessions: off.
- "Dynamic workflow size": large.

Confirm the setting names exist in this version.

### S3. Scaffold and infrastructure

1. Scaffold into an empty folder outside the repo, then copy the files into the repo
   without overwriting `README.md`, `.gitignore`, `.claude/`, `docs/`, or `scripts/`:
   - `npx create-next-app@15 %TEMP%\oh-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --disable-git --yes`
   - Merge the template's `.gitignore` lines into ours.
2. Install `@supabase/supabase-js`, `openai`, `zod`, `maplibre-gl`, `lucide-react`,
   `clsx`, `date-fns`, and `sharp`. Dev dependencies: `tsx`, `vitest`,
   `@playwright/test`, and `@faker-js/faker@10.6.0`. Then run
   `npx playwright install chromium`.
3. Add npm scripts that load secrets with `node --env-file=.env.local` (section 4,
   item 10).
4. Migrate. Run `npm run db:migrate:dev` and `npm run db:migrate:demo`; the human
   approves the demo one. Create the Storage bucket `memories` on both projects from
   the migrate script, using the server key.
5. Muse smoke test. `npm run eval:muse -- --smoke` makes one Ember call, one Spark
   call, and one image. It logs only status and latency to
   `docs/evidence/S-MUSE.md`.
6. Push `overnight` and open the draft PR `overnight → main`. Confirm the Vercel
   preview builds and renders.

### S4. Survey real Facebook (read-only)

- Use Claude in Chrome on facebook.com in the human's logged-in profile, with
  screenshots only. Never click a control that changes state, and never open private
  messages.
- Capture Home, Profile, Friends, a public Group page, Events, Notifications, and the
  docked chat at 1440x900 and 390x844. Save them to `reference/fb/`, which is
  gitignored and never committed.
- Write `docs/FB_SPEC.md` in your own words, covering per surface: regions, sizes,
  colors, type, and states.
- Starting tokens to confirm against the screenshots:
  - background `#F0F2F5`;
  - white cards with an 8 px radius;
  - blue `#0866FF`;
  - secondary text `#65676B`;
  - a 56 px top bar;
  - 40 px feed avatars;
  - a Segoe UI system font stack.
- No real names or images go into the spec.

### S5. Unattended-run guards

1. **`.claude/hooks/no-prompt.mjs`** (`PermissionRequest`, command
   `node "${CLAUDE_PROJECT_DIR}/.claude/hooks/no-prompt.mjs"`).
   - When `.verify/ARMED` exists, it appends the request to `.verify/prompts.jsonl` and
     returns
     `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Unattended run: log this in docs/PROGRESS.md under Known issues, take the default, continue."}}}`.
   - Without `ARMED` it prints nothing, so Phase S prompts still reach the human.
2. **`.claude/hooks/guard.mjs`** (`PreToolUse`, matcher `Bash|PowerShell`).
   - It exits 2 for:
     - `push` with `--force`, `-f`, or `+refspec`;
     - a push to `main`;
     - `reset --hard`;
     - `clean -fdx`;
     - `rm -rf` or `Remove-Item -Recurse` outside the repo;
     - any read of `.env*` or `brawlcam.env`.
   - Wrap its body in try/catch so that an internal error also exits 2 and the guard
     fails closed.
3. **`.claude/hooks/log-failures.mjs`** (`StopFailure`, `PermissionDenied`). It
   appends to `.verify/failures.jsonl`. The handoff lists every row.
4. **Review subagents in `.claude/agents/`.** None has Edit or Write tools, so none can
   fix what it reviews. Each returns findings as JSON:
   `{id, severity: blocker|major|minor, file, repro, fix}`.
   - `e2e-verifier`:
     - Runs `npm run test:e2e` plus one exploratory two-persona flow it invents,
       against `out-here-dev`.
     - It is told to refute "this works" and to answer "refuted" when unsure.
     - Every finding includes the exact steps that failed.
   - `reviewer`: the kit's reviewer brief, run on the slice's diff. It covers crashes
     on empty data, join races, time math, location leaks, secrets in client code,
     dead buttons, and `window.alert`.
   - `ui-critic`:
     - Takes Playwright screenshots of the slice's screens at 390 and 1440 px
       (`.verify/shots/`).
     - Compares them with `docs/FB_SPEC.md` and `reference/fb/`.
     - Returns the 5 most visible differences from real Facebook.
   - `judge`:
     - Scores the preview URL against the four Devpost criteria, 1 to 10 each, with
       the weights from section 1.
     - Names the 3 changes that would raise the weighted score most.
     - It runs once per milestone.

### S6. Seed pipeline check

Run `npm run gen:images -- --limit 3` and `npm run seed -- --target dev --small`, and
confirm that three faces and five personas appear in the app. The full image run and
seed content are milestone M1 overnight.

### S7. Time plan

Write `docs/RUN.json`:

```json
{
  "runStart": "<now>",
  "freezeAt": "2026-11-13T07:00:00-08:00",
  "handoffAt": "2026-11-13T08:00:00-08:00",
  "deadline": "2026-11-13T10:30:00-08:00"
}
```

These are the kit's times. Phase S must end by about 02:30 PT to leave 4.5 hours of
building.

### S8. Dry run (human present, about 15 minutes)

1. Inside a **Workflow**, one builder agent makes a one-line change on a worktree
   branch, and the `e2e-verifier` checks it.
   - The human answers Yes to the first-launch Workflow approval.
   - Confirm that the worktree started from local HEAD, not `origin/main`.
2. The main session merges, runs the checks, commits, pushes `overnight`, and the
   preview deploys.
3. Run `bash scripts/board.sh post status "dry run"` and `bash scripts/board.sh read`.
4. Create `.verify/ARMED`. Then add a temporary ask rule for `Bash(echo prompt-test)`,
   run it from a Workflow agent, confirm that `no-prompt.mjs` denied it, and remove the
   rule.
5. Open `/permissions` → Recently blocked and add allow rules until a second pass is
   clean.
6. Chrome from a subagent: try one screenshot of localhost from a subagent, and record
   the result in `docs/DECISIONS.md`.

### S9. Launch Phase N

Close the Phase S session. In Windows Terminal, run
`claude --chrome --permission-mode auto` (no `--remote-control`), then send:

```
ultracode. /loop Follow MVP-BUILD-PLAN-itr-1.md section 7 and docs/MASTER_PROMPT.md. If docs/PROGRESS.md exists you are resuming: re-read the plan and progress files and continue.
```

Then ask it to create a session cron every 30 minutes with the same resume line, as a
backstop for a turn that ended on an API error. Watch the first milestone start, then
go to sleep. Follow along on the board issue from your phone.

---

## 7. Phase N: overnight milestones (replaces the kit's M0 to M7)

Each milestone ends the kit's way: checks green, looked at in the browser at 390 and
1440 px, commit, push `overnight`, update the PR, post `milestone`, update the
dashboard, and update the README. Targets are hours after `runStart`. If time is short,
cut from the bottom of the current milestone, never from Out Here P0.

| # | Target | Work | Who |
|---|---|---|---|
| M1 | +0:45 | Full image generation, seed content JSON, `npm run seed` on dev, `seed:demo` on demo; contracts in `src/shared/` (kit types + FB types + `canSee`) | main |
| M2 | +1:45 | FB-P0 shell, Feed, Profile, Friends, Notifications | builder **fb** |
| M2 | +1:45 | Muse pipeline: parse (Ember) → candidates (code) → rank/explain (Spark) → validate, with `muse_runs` logging and fixtures | builder **muse** |
| M2 | +1:45 | Out Here map tab (MapLibre + OpenFreeMap, overhead view), Friends/Explore toggle, quest pins with live seat counts, quest sheet, "I'm free" composer | builder **map** |
| M3 | +2:45 | Integrate all three. Invites as notifications, Accept, and `join_quest`. Live seats over Broadcast in two tabs. Playwright `demo.spec.ts` drives the full flow with two personas. **P0 checkpoint on the preview URL with real Muse.** | main + e2e-verifier |
| M4 | +3:45 | Group page Hangouts tab; FB-P1 Messenger (invites as messages), Events, Search | builder **fb** |
| M4 | +3:45 | Kit P1: "We're done" → photo → crew album with Muse caption → "Do this again" | builder **memories** |
| M4 | +3:45 | Tilted walking view with 3D buildings (section 2, "Map, in two steps"). Only after the M3 checkpoint passes; cut first if M4 runs late. | builder **map** |
| M5 | until freeze | Kit P2 (Daily Quest with vision check, weekly streak, Wrapped), then FB-P2 (Marketplace, Reels), polish, and a reviewer pass on the full diff | builders + reviewer |
| M6 | freeze → handoff | Fixes only. `seed:demo`. Final e2e on the preview URL. `docs/HANDOFF.md` and `docs/DEVPOST.md` per the kit, screenshots, README final, board `done`. | main |

**Rules that apply all night**

- `.claude/rules/*` and the kit's work loop, board protocol, blocker playbook, and
  quality bar still apply.
**Self-review loop (every builder slice, before merge)**

1. The builder finishes. The main session runs the checks on the builder's branch
   itself, since a builder's report is never proof.
2. Run `e2e-verifier`, `reviewer`, and, for UI slices, `ui-critic` on that branch in
   parallel in one Workflow.
3. Turn every blocker and major finding into a fix task for the same builder,
   re-briefed with the findings. Reproduce each bug before fixing it (AGENTS.md rule 3).
4. Repeat steps 2 and 3 until a round returns no blocker or major, with **at most 3
   rounds**.
   - After round 3, merge what passes.
   - Revert what does not, and log it under Known issues.
5. Minor findings go to a `docs/POLISH.md` queue. M5 and spare time work through it.

**Milestone loop (end of every milestone)**

- Run `judge` on the preview URL. Its top 3 changes become the first tasks of the next
  milestone, unless they conflict with Out Here P0.
- Each `judge` score goes in `docs/PROGRESS.md`, so the morning handoff shows whether
  the scores went up.
- Cap the review agents at 3 at once, the same as builders, so review never starves
  the build.
- All tests run against `out-here-dev`. `out-here-demo` changes only through
  `npm run seed:demo`.
- No `window.alert`, `confirm`, or `prompt` anywhere in the app. They hang Claude in
  Chrome.
- If Chrome disconnects, post `blocked` once ("run /chrome → Reconnect") and continue
  with Playwright screenshots.
- If Muse latency makes the demo feel slow, measure it, then try Spark `minimal`, then
  Ember for ranking. Log each result in `docs/DECISIONS.md`.

**Morning (humans).** Follow the kit's README "Morning checklist":

1. Read `docs/HANDOFF.md`.
2. Rehearse twice on two devices.
3. Merge the PR.
4. Make the repo public.
5. Submit by 10:30 AM PT.
