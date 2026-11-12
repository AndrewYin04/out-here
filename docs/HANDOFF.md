# Handoff: Out Here MVP (freeze Thu Nov 12, 07:30 AM PT)

Read this first. Everything below was built overnight by Claude Code on branch `overnight` and checked on the deployed preview with real Muse and the demo Supabase project.

## Links

- **Preview (latest, 76f0286):** https://out-here-53rpnemqr-andrews-projects-76721bc6.vercel.app (pages, APIs and the Muse plan smoke-tested at 06:55 PT; the full two-tab demo was walked in Chrome on the previous preview 3df9384)
  - It sits behind Vercel login. Until someone turns off Deployment Protection, open it while logged in to Vercel, or ask Andrew for a share link (Vercel dashboard, Share). Share links are credentials: never commit or post them.
- **Board (talk to the agent):** https://github.com/AndrewYin04/out-here/issues/1
- **Deploy requests:** issue #4 (comment `DEPLOY <branch>`), see `docs/DEPLOYS.md`.
- **Draft PR:** `overnight` → `main` (the team merges).

## What works (verified end to end)

**Facebook base** (fictional people with Muse-generated faces, measured Facebook tokens):
- Shell: top bar, left nav, right rail with Contacts and online dots, mobile bottom bar, persona switcher (avatar menu or `?as=<handle>`).
- Feed: composer above stories, stories viewer, posts with the 7 reactions, comments with one reply level, share, photo upload, audience picker, live Out Here card.
- Profiles (cover, intro filtered by visibility, Posts/About/Friends/Photos), Friends (requests, suggestions, all friends, lists).
- Groups with Discussion, Members, and a Hangouts tab of that group's Out Here plans with live seats.
- Notifications page and bell popover with a live unread badge.

**Out Here tab:**
- MapLibre + OpenFreeMap map of Menlo Park with plan pins and live seat badges (Explore view) and a quest panel to join or leave.
- Friends view ("Find My"): friends' avatar pins with status bubbles, People list by distance, friend card (profile, message, Want to hang?), and your own sharing settings (audience, exact or approximate, pause, edit bubble).
- **Muse picks on the map:** after a plan, the picked pins get a ring and a "✨ Muse pick" label, other pins dim, and the map frames you, Maya and the pick. Reasons cite a concrete fact (a friend's bubble, a shared interest, budget headroom), never generic filler.
- **Entry points:** the Feed's Out Here card "I'm free" opens the composer (`/out-here?free=1`); `/out-here?mode=friends` opens the Friends map; friend cards show View profile and Want to hang? (Message is hidden until Messenger can open a thread).
- **Memories** (`/memories`): Alex's crews with their album photos and "Get this group together again", where Muse proposes the next plan from the crew's shared interests and free windows. Notifications include Out Here invites and joins.
- **The core loop:** "✨ I'm free" → type what you want → Muse (real API) picks plans that fit your time, walking distance, budget and free friends, explains why in plain words, and drafts the invite → invite a friend → the friend sees it live and accepts → seats update live on every screen.

Muse in the loop: parse with `muse-ember-1.0`, rank and explain with `muse-ember-1.0` (Spark was 5.7-7.0 s; set `MUSE_RANK_ROLE=smart` to use Spark). Measured on Vercel: plan 2.1-4.3 s, Muse 1.0-2.6 s.

## The demo (5 min + 3 min Q&A)

**Reset first.** Run `npm run seed:demo` on Andrew's laptop within 10 minutes of going on stage, and again after every rehearsal. Story times are relative to the seed time (the dumpling plan starts 25 min after seeding; Maya is "on a long lunch" for 50 min). A rehearsal that joins or invites uses up the seats.

Two devices or two browser windows (each tab is its own persona): window A `…/out-here?as=alex`, window B `…/out-here?as=maya`.

1. **0:00-0:30, the problem.** "Alex moved to Menlo Park three weeks ago. He has 40 free minutes and nobody to spend them with. Plans die in the group chat."
2. **0:30-1:15, Facebook he already uses.** On A, show Home briefly (the Out Here card says Maya is free and 16 plans are nearby), then the Out Here tab: the live map of plans with open seats. Toggle **Friends**: friends who share their location, with status bubbles. Maya's says she's craving dumplings.
3. **1:15-2:45, Muse does the hard part.** Tap **✨ I'm free**, type "hungry, got like 40 min, under $15". Muse returns Dumplings before the rush with Maya and explains why (her bubble, shared interest, 9 min walk, $12, 2 seats left). Open **Why not others?**: ramen is 28 min away, sushi is $26. Tap **Invite Maya**: Muse drafted the message. Send.
4. **2:45-3:30, live.** On B (Maya), the invite appears at once. Accept. Both maps flip the pin to **Full**; Alex's card says "Maya's in… leave by … for the 9 min walk".
5. **3:30-5:00, why AI, why Facebook, safety.** Muse parses messy intent, matches against friends' real free time and bubbles, checks walking time, budget and seats in code, and only then explains; it cannot invent plans (it ranks only real candidates). Facebook already has the friends, Groups and Events; Out Here connects them in the moment. Safety: location sharing is opt-in by audience with approximate mode and pause; plans are at public venues; the browser never reads the database directly.

## Not done (team daytime list, in priority order)

**New ideas from Andrew (Thu morning), not started:**
- **"Click": agents that vet a match for you.** Like Boardy, but each person's own Muse agent represents them, and two agents talk to each other first about whether their people would be a good fit (interests, goals, what each is looking for, timing, dealbreakers). Only when both agents agree is an intro proposed to the two humans, who then each accept (double opt-in). The agent-to-agent conversation is the visible AI work: show a short "why your agents think you'd click" summary, and keep the transcript private to each side. Builds on the Muse Intros spec in MVP-BUILD-PLAN-itr-1.md (reach, trust path, score threshold, frequency cap).
- **First-person "Pokémon Go" map view.** A character avatar for the viewer standing on the map, in a tilted 3D street-level view, that walks toward plans shown as landmark "stadiums" (quest venues as visible 3D markers you can see from a distance, with seat counts). Tapping a stadium opens the quest; walking (or tapping a direction) moves the avatar along the route, with the walk minutes counting down. Extends the planned 3D walking view (MapLibre pitch ~60 plus fill-extrusion buildings); never uses real GPS without consent, and the demo moves the avatar along a simulated route.

**More ideas from Andrew (Thu late morning), not started:**
- **Third-person "Pokémon Go" view, zoomed in on your avatar.** The camera follows the viewer's avatar from just behind and above it (tilted 3D street level), so you see your character on the map and the plans around you. Pairs with the first-person "stadiums" idea above.
- **Muse as a companion character.** A small Muse agent floats next to your avatar on the map. When you ask it something ("I'm free", a question about a plan), it floats in front of your avatar and "talks to you": its answer appears as speech from the character, then it returns to your side.
- **Partiful-style event page.** Tapping into an event or plan opens a Partiful-like page: cover, host, time and place, the guest list (going, maybe, invited, friends first), and an activity feed where guests comment, react and post updates. See partiful.com for the interface to match.
- **Announcements delivered by Muse.** When you host a hangout, you can record a short voice or video message and broadcast it to the people you choose, or let Muse choose who it fits. Animation: your agent heads out across the map to "deliver" it, and each recipient sees a Muse agent arrive on their screen to tell them about the event and play your recording, with Join and Not now.

**Gap found in the morning review:** there is no single place to see the plans you joined. Today you see it per plan (the quest panel says "You're going") or through notifications. Add a **"Your plans"** list: a button on the Out Here map and the Going tab on `/events`, listing every plan the viewer joined (time, place, who is going, Leave). About one builder slice.

From `docs/REVIEW-2026-11-12.md` (adversarial review, 134 findings) and the plan:
1. **Demo reset button** (review B1): `resetStory(now)` + `POST /api/demo/reset` so the stage reset does not need the laptop.
2. **Production**: in Vercel, turn off Deployment Protection (or share the link), then promote the verified preview to Production and give judges the production URL. Previews and Production both read the demo database right now (review D11 suggests previews read dev).
3. **Muse Intros** (Boardy-style warm intros; full spec in the plan, "Muse Intros"; review B3 fixes the Alex-Jordan story).
4. **Messenger.** `/messages` is still the shell's loading skeleton, while the top-bar Messenger icon shows a red unread badge (7), so clicking it looks broken to a judge. The data and routes exist (20 seeded threads, `/api/threads`, `/api/threads/[id]/messages` list and send, `thread:<id>` realtime); only the screen is missing: inbox (avatar, name, last message, time, unread dot), open a chat, send with live delivery to the other persona's tab, docked chat windows from Contacts, and Out Here invites shown as messages with Accept/Decline. About one builder slice. Until then, consider hiding the badge or showing a "coming soon" state.
5. Memories capture ("We're done" → photo prompt → album; review B7: any member can complete). The /memories page and Muse regroup exist; capturing a new photo after a live hangout does not.
6. 3D walking view, Events detail, Search, Marketplace, Reels, Daily Quest, streaks, Wrapped (cut first).
7. `docs/POLISH.md`: 59 minor UI findings from the review agents.

## Known issues

- **The e2e suite is written for MemoryStore mode** (fresh seed per server start). Against a real database, specs collide on shared state (seats already taken, posts already reacted). Run with `E2E_EXPECT_TIMEOUT=15000`, reseed before each spec, or keep MemoryStore for CI. The core two-persona loop was verified by hand on the deployed preview.
- Locally against `out-here-dev` (us-west-2), writes take 1-2.5 s because each mutation reloads the snapshot; on Vercel next to the demo database it is ~0.5 s.
- Vercel previews need a login (Deployment Protection) until a human changes it.
- Chrome extension sometimes loses its connection after a VS Code reload; reconnect in Claude Code with `/chrome`.

## For the team's agents

- Rules: `CLAUDE.md` and `.claude/rules/*`; master plan `MVP-BUILD-PLAN-itr-1.md`; current state `docs/PLAN.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`.
- Facebook look: `docs/FB_SPEC.md` (measured from real facebook.com, read-only) and screenshots in `reference/fb/` on Andrew's laptop only (gitignored).
