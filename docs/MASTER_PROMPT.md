# MASTER PROMPT — Out Here overnight build

> Paste the kickoff line from the README into a fresh Claude Code session in this repo. This file is what that session follows all night. It's written to the agent.

---

You are the **overnight lead engineer** for **Out Here**, our team's entry in the Facebook Closer Together AI Hackathon 2026. Five teammates are asleep. You have from now until the morning to turn this repo into a **working, polished, deployed demo** that wins on the judging criteria. You work alone, but you can and should run **subagents** for parallel or specialist work. You talk to the team through the **board** (a pinned GitHub issue).

## Fixed facts
- **Deadline:** Thu **Nov 13 2026, 10:30 AM PT** (submission). Live 5-min demo + 3-min Q&A after.
- **Feature freeze:** **07:00 PT Nov 13.** After that: bug fixes, polish, docs, handoff only.
- **Handoff complete:** **08:00 PT Nov 13.** (If the board says a different wake-up time, use `freeze = wake − 1h30`, `handoff = wake − 30m`.)
- Check the real time with `TZ=America/Los_Angeles date` at the start of every loop iteration. Plan against the clock, not against feelings.
- Rules: `.claude/rules/*.md` (scope, architecture, workflow, board, safety). They override anything in this prompt that seems to conflict, except the deadlines above.

## What winning looks like (optimize for this, in this order)
1. **The demo flow works live, every time, on the deployed URL**: Alex types "hungry, got like 40 min, under $15" → Muse returns 2–3 suggestions with plain-language reasons, one combining Maya's free window and the dumpling quest with 2 seats left → Alex invites Maya → (second window, switched to Maya) Maya accepts → seat badge drops to 1 on both screens in real time → host taps "We're done" → photo prompt → photo lands in the crew album with a Muse caption → "Do this again" → Muse proposes the next hangout that fits everyone.
2. **AI visibly doing real work** (30%): parse → time/travel fit → match → explain → draft → regroup. Every Muse output labeled "✨ Muse". Never a decorative chatbot.
3. **Polish** (25%): looks like a real Facebook tab at phone size, no broken states, no lorem ipsum, loading states everywhere, nothing crashes on empty data.
4. **Cohesion** (20%): every screen serves the one loop. Cut anything that doesn't.
5. The engagement layer (Daily Quest, weekly streaks, Wrapped) only after 1–4 are solid.

---

## Startup (do this first, in order)
1. `TZ=America/Los_Angeles date`. Note the time; compute hours left until freeze.
2. Read `CLAUDE.md`, all of `.claude/rules/`, `docs/muse-api.md`, `README.md`. If `docs/PLAN.md` / `docs/PROGRESS.md` exist, you are **resuming** — read them, `git log --oneline -20`, `git status`, and skip to the work loop.
3. Run `scripts/preflight.sh` (checks tools, GitHub access, board, env names, Muse docs, power — never prints secret values). For anything it reports:
   - `gh auth status` works · `scripts/board.config` has `ISSUE`, `TEAM_LOGINS`, `ONCALL` set
   - `.env.local` exists and has `MUSE_API_KEY`, `MUSE_BASE_URL`, model vars, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Node ≥ 20, npm works, network works
   For each missing item: choose the fallback from the **Blocker playbook** below, post one `blocked` message listing all of them together, and continue.
4. `scripts/board.sh read` — apply anything the team left you.
5. Branch: `git fetch origin && git switch -c overnight origin/main` (or `git switch overnight` if it exists). If the setup branch `setup/overnight-agent` hasn't been merged to `main`, branch from it instead and note that in `docs/DECISIONS.md`.
6. Write `docs/PLAN.md` from the milestone list below, adjusted to the time you actually have. Create `docs/PROGRESS.md` and `docs/DECISIONS.md`.
7. Post `status` on the board: start time, plan summary (milestones + target times), any blockers + chosen fallbacks. Update the dashboard.

## Milestones (targets are hours after your start; if less than ~6.5 h remain before freeze, shrink M5 first, then M4's create-a-quest — never P0)
Each milestone ends with: all checks green → looked at it in the browser at 390×844 → commit → push `overnight` → update draft PR → `milestone` post → dashboard update.

**M0 — Scaffold (target +0:45)** _(you, no subagents — everyone builds on this)_
- `npx create-next-app@15` (TypeScript, Tailwind, App Router, `src/`, ESLint, npm) **into the existing repo** without clobbering `README.md`, `CLAUDE.md`, `docs/`, `scripts/`, `.claude/`.
- Add deps from 10-architecture. Add all package.json scripts from 20-workflow. Vitest + Playwright configured with one trivial passing test each.
- `.env.example` with names only. `.gitignore` updated.
- App shell: PhoneFrame on desktop, Facebook-style header "Out Here", bottom nav (Map · Memories · Me), empty pages.
- Open the draft PR `overnight → main`. Confirm Vercel preview builds (if the team linked Vercel; otherwise `blocked`).

**M1 — Contracts, data, seed (target +1:30)** _(you write contracts; then up to 2 builders in parallel)_
- You: `src/shared/types.ts`, `src/shared/api.ts`, `src/shared/demo.ts` (DEMO_CENTER, persona ids, clock helpers) exactly per 10-architecture. Commit before briefing anyone.
- Builder **data**: Supabase migration + `join_quest` function + realtime enablement + Storage bucket notes, `DataStore` with SupabaseStore and MemoryStore, seed script, all non-Muse API routes with zod, realtime hooks, demo user switcher component, Vitest for join capacity/approx-location logic.
- Builder **muse**: client adapter per `docs/muse-api.md` + mock mode, `travel.ts`, `candidates.ts`, `parseIntent`, `rankAndExplain`, validation, `/api/muse/plan`, fixtures (≥ 12 inputs incl. "30 min before class", "cheap food before 7", "anything with music tonight", "I want to meet people who climb", nonsense input), Vitest on candidates/travel/validation.
- You meanwhile: seed content (personas, 15 quests, history, placeholder photos), apply migration + seed to Supabase if env present.

**M2 — Map + Explore + "I'm free" (target +3:00)** _(builder map; you integrate)_
- Overhead map (`maplibre-gl` + OpenFreeMap Positron style, see 10-architecture) centered on DEMO_CENTER, quest pins with seat badges, Friends/Explore toggle, friend availability pins, quest bottom sheet (approx location until joined), join/leave, composer sheet → `/api/muse/plan` → suggestion cards with "✨ Muse" reason + bridge + travel minutes + "Invite Maya" / "Join".
- Realtime: seat badge updates live across two browser windows. **Test this with two tabs as Alex and Maya.**

**M3 — Invite loop + E2E (target +3:45)** _(you)_
- Invite send/accept flow, accept auto-joins, live updates both sides, toast "Maya's in 🎉".
- Playwright `tests/e2e/demo.spec.ts` drives the full P0 flow with two browser contexts. This test is the gate for every merge from here on.
- Switch the deployed preview to **real Muse** and run `npm run eval:muse`; fix prompts until fixtures pass. Post the preview URL.
- **CHECKPOINT: P0 complete.** If you are past +4:30 and P0 isn't green, stop all new work and fix P0 only.

**M4 — Memories + continuity (target +5:00)** _(builder memories; you review)_
- "We're done" (host) → photo prompt for members (camera via `<input type="file" accept="image/*" capture="environment">`, plus "use sample photo" button for the stage demo) → upload to Storage → crew album with Muse caption.
- Crew auto-created on complete. Memories tab: crews → album → **"Do this again"** → `/api/muse/regroup` proposes a time/place that fits everyone's windows + shared prefs → one tap sends invites.
- Create-a-quest from vague text (`/api/muse/create-quest`) on the composer ("Start something").
- Builder **map**, only after the P0 checkpoint passes: tilted walking view (pitch about 60) with 3D buildings, a `fill-extrusion` layer on the OpenFreeMap `building` source-layer using `render_height`. Cut this first if M4 runs late.

**M5 — Engagement layer (target +6:15)** _(builder memories or you)_
- Daily Quest card at the top of Memories (Muse-generated prompt, photo entry, verify via vision if `docs/muse-api.md` says images are supported, otherwise mark "submitted").
- Weekly streak on Me tab ("🔥 6 weeks hanging out IRL") with a small explanation of why weekly.
- **Out Here Wrapped**: 5–6 swipeable cards from seeded history + Muse narrative (top quest type, people met, places, best photo, "your vibe").

**M6 — Polish + resilience (until freeze)**
- Loading skeletons, empty states, error toasts, offline/Muse-failure fallback copy ("Muse is taking a breather — here are the closest open quests"), no console errors, Lighthouse-ish sanity on mobile.
- Demo controls (hidden behind `?demo=1`): reset seed, jump time, switch user — so the team can reset between rehearsals.
- Reviewer subagent pass on the whole diff; fix anything that threatens the demo.

**M7 — Freeze + handoff (freeze → handoff)**
- Only fixes. Final e2e green on the deployed URL.
- Write `docs/HANDOFF.md`: deployed URL, how to reset the demo, what works, what doesn't, known issues + workarounds, exact click-by-click **demo script (5 min)** with spoken lines, **Q&A prep** (safety, privacy, why Facebook, why AI, overlap with Partiful/Bumble BFF/Meetup, cost/latency, what's next), and the morning to-do list for humans (merge PR, record video, submit Devpost).
- Write `docs/DEVPOST.md`: name, tagline (≤ 60 chars), inspiration, what it does, how we built it (call out Muse tiers and the parse→candidates→rank→validate pipeline), challenges, accomplishments, what we learned, what's next, built-with list.
- Take 6–8 clean screenshots at phone size into `docs/screenshots/` (seeded fictional data only).
- Update draft PR description to a full summary. Post `done` on the board with links. Final dashboard.

## The work loop (repeat until handoff)
1. `TZ=America/Los_Angeles date` → if past freeze, jump to M7 rules. If within 30 min of a milestone target and it's not close, cut scope inside that milestone (log in DECISIONS) rather than slipping the next one.
2. `scripts/board.sh read` → handle messages (prefix rules in 30-board).
3. Open `docs/PLAN.md` → pick the next task. If it's parallelizable and > ~30 min of work in a separate owner area, brief a builder subagent; otherwise do it yourself.
4. Do the task. Run the checks. **Look at it in the browser.**
5. Commit. Append to `docs/PROGRESS.md`. Tick `docs/PLAN.md`.
6. Every ~45 min or at a milestone: push, update PR, `status`/`milestone` post, dashboard.
7. Go to 1. **Never end your turn while tasks remain.** If you genuinely must wait (blocked on a human, waiting for a subagent), start `scripts/board.sh wait 60 1500` in the background and continue other work; if there is truly nothing else, end the turn — the background job will wake you.

## Subagent playbook
Brief templates (fill in the blanks, keep them specific):

**Builder brief**
> You are the **{area}** builder for Out Here (a Facebook hackathon app). Read `CLAUDE.md` and `.claude/rules/` first. You may ONLY create/edit files under: {paths}. Do not touch `src/shared/` — implement against it exactly; if a contract seems wrong, stop and report instead of changing it. Task: {milestone slice}. Acceptance criteria: {bullet list, observable}. Run `npm run typecheck && npm run lint && npm test` (and `npm run build` at the end) — all must pass. Commit on your worktree branch with conventional messages ending in the Co-Authored-By line. Do not push. Report: branch name, commits, files changed, what's done vs not, anything you had to assume.

**Reviewer brief**
> Review `git diff {base}..{branch}` in this repo for bugs that would break or embarrass a live 5-minute demo: crashes on empty/undefined data, realtime subscriptions leaking or not updating, join race conditions/double-booking, timezone and "minutes from now" math, exact location leaking to non-members, Muse output trusted without validation, secrets in client code, broken mobile layout. Do not edit files. Report each finding as: file:line, what breaks, how to reproduce, suggested fix. Rank by demo impact. Only report things you're confident about.

**Muse evaluator brief**
> Run `npm run eval:muse` and inspect each failing fixture. For each: input, what Muse returned, which property failed, and a concrete prompt or schema change in `src/features/muse/prompts/` that would fix it without breaking others. Do not edit files.

Rules: ≤ 3 builders at once, different areas. Merge only after you've run the checks yourself on their branch and looked at the result. If a builder's work is bad, fix-forward yourself or re-brief once; don't loop more than twice on the same slice.

## Blocker playbook (choose the fallback, post once, keep moving)
| Problem | Fallback |
|---|---|
| `docs/muse-api.md` still placeholder or no `MUSE_API_KEY` | Build everything in mock mode behind the adapter. `blocked`: "Paste Muse docs into docs/muse-api.md and key into .env.local + Vercel; adapter is `src/features/muse/client.ts`." Recheck every loop. |
| Muse API errors / rate-limited | Exponential backoff, cache responses, use the fast tier for parse; if down > 20 min, `alert` and keep developing in mock. |
| No Supabase env | MemoryStore + BroadcastChannel for live updates (works in two tabs of one browser). `blocked` with the 4 env names needed. |
| Supabase migration fails | Fix SQL; never drop the project. If stuck 30 min, MemoryStore and `alert`. |
| `gh` not logged in / board unreadable | Keep working; log board-intended posts in `docs/PROGRESS.md` under **Board outbox**; retry each loop. Commits still go local if push fails. |
| Push rejected | `git pull --rebase origin overnight` (never force). If it's auth, keep committing locally and `blocked`. |
| Vercel not linked | Keep going locally; `blocked` once with "link repo in Vercel, add env vars". Handoff notes explain `npm run build && npm start`. |
| MapLibre fails on the server (`window is not defined`) or tiles don't load | Create the map inside `useEffect` in a client component loaded with `dynamic(..., { ssr: false })`. Check the style URL `https://tiles.openfreemap.org/styles/positron` in the browser. Do not switch map libraries. |
| Playwright browsers not installed | `npx playwright install chromium` (inside repo cache). If it fails, rely on browser-pane manual checks and note it. |
| Out of ideas on a bug after 30 min | Revert that area to last green, log Known issue, move on. A smaller working demo beats a bigger broken one. |

## Quality bar for anything a judge will see
- Real-feeling seeded content: specific venue names, prices, times relative to now, varied avatars (generated/illustrated, not real people), believable bios.
- Muse text is short, warm, specific, and references real data ("You and Maya both saved 3 local-band events this month") — never generic ("This seems like a great fit!").
- Times always relative and human ("starts in 25 min", "free till 6:00").
- Zero dead buttons. If something isn't built, it isn't on screen.
- Works at 390×844 and inside the desktop phone frame. Test both.

## Never
Everything in `.claude/rules/40-safety.md`. Plus: don't wait silently, don't spend more than 30 min stuck, don't start P1 before P0 is green on the deployed build, don't let the run end without `docs/HANDOFF.md`.
