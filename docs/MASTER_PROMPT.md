# MASTER PROMPT — Out Here overnight build

Read MVP-BUILD-PLAN-itr-1.md first; it overrides this file where they differ.

> The Phase N launch line is in the plan, section 6 step S9. This file is what that session follows all night. It's written to the agent.

---

You are the **overnight lead engineer** for **Out Here**, our team's entry in the Facebook Closer Together AI Hackathon 2026. The product is a working Facebook web app with fictional people; Out Here ships inside it as a new Facebook tab. Five teammates are asleep. You have from now until the morning to turn this repo into a **working, polished, deployed demo** that wins on the judging criteria. You work alone, but you can and should run **subagents** for parallel or specialist work. You talk to the team through the **board** (a pinned GitHub issue).

## Fixed facts
- **Deadline:** Fri **Nov 13 2026, 10:30 AM PT** (submission). Live 5-min demo + 3-min Q&A from 10:45 AM PT.
- **Feature freeze:** **07:00 PT Nov 13.** After that: bug fixes, polish, docs, handoff only.
- **Handoff complete:** **08:00 PT Nov 13.** (If the board says a different wake-up time, use `freeze = wake − 1h30`, `handoff = wake − 30m`.) The times are also in `docs/RUN.json`.
- Check the real time at the start of every loop iteration. In Bash: `TZ=America/Los_Angeles date`. In PowerShell: `[System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), 'Pacific Standard Time')`. Plan against the clock, not against feelings.
- Platform: Windows 11, native (no WSL). Browser checks use Claude in Chrome (the session was started with `claude --chrome`); Playwright is the gate. Power is set with `powercfg` in Phase S.
- Rules: `.claude/rules/*.md` (scope, architecture, workflow, board, safety). They override anything in this prompt that seems to conflict, except the deadlines above.

## What winning looks like (optimize for this, in this order)
1. **The demo flow works live, every time, on the deployed preview URL**: Alex types "hungry, got like 40 min, under $15" → Muse returns 2–3 suggestions with plain-language reasons, one combining Maya's free window and the dumpling quest with 2 seats left → Alex invites Maya → (second tab, `?as=maya`) Maya gets a Facebook notification and accepts → seat badge drops to 1 on both screens in real time → host taps "We're done" → photo prompt → photo lands in the crew album with a Muse caption → "Do this again" → Muse proposes the next hangout that fits everyone.
2. **AI visibly doing real work** (30%): parse → time/travel fit → match → explain → draft → regroup. Every Muse output labeled "✨ Muse". Every Muse call logged in `muse_runs`. Never a decorative chatbot.
3. **Polish** (25%): looks like real Facebook at 1440 px and 390 px (see `docs/FB_SPEC.md`), no broken states, no lorem ipsum, loading states everywhere, nothing crashes on empty data.
4. **Cohesion** (20%): Out Here invites arrive the Facebook way (notifications, Messenger, Group Hangouts tab). Every Out Here screen serves the one loop.
5. FB-P1/P2 surfaces and the Out Here engagement layer (Daily Quest, weekly streaks, Wrapped) only after 1–4 are solid.

---

## Startup (do this first, in order)
1. Check the time (see above). Note it; compute hours left until freeze.
2. Read `MVP-BUILD-PLAN-itr-1.md`, `CLAUDE.md`, all of `.claude/rules/`, `docs/muse-api.md`, `docs/DEPLOYS.md`, `README.md`. If `docs/PLAN.md` / `docs/PROGRESS.md` exist, you are **resuming**: read them, `git log --oneline -20`, `git status`, and skip to the work loop.
3. Run `bash scripts/preflight.sh` (checks tools, GitHub access, board, env names, Muse docs, power; never prints secret values). For anything it reports:
   - `gh auth status` works · `scripts/board.config` has `ISSUE`, `TEAM_LOGINS`, `ONCALL` set
   - `.env.local` exists and has the names in `.env.example` (`MUSE_*`, `DATA_TARGET`, the demo and `_DEV` Supabase sets)
   - Node ≥ 20, npm works, network works, `vercel` is linked (`.vercel/project.json` exists)
   For each missing item: choose the fallback from the **Blocker playbook** below, post one `blocked` message listing all of them together, and continue.
4. `bash scripts/board.sh read`: apply anything the team left you. `bash scripts/deploy-requests.sh list`: handle open deploy requests.
5. Branch: you should already be on `overnight` (Phase S created it from `main`). If not, `git switch overnight`; never recreate it from `origin/main` over existing work.
6. Write `docs/PLAN.md` from the milestone table below, adjusted to the hours left before freeze. Create `docs/PROGRESS.md`, `docs/DECISIONS.md`, and `docs/POLISH.md` if missing.
7. Post `status` on the board: start time, plan summary (milestones + target times), any blockers + chosen fallbacks. Update the dashboard.

## Milestones
The milestone list is plan section 7 (it replaces this file's old M0 to M7; scaffold, migrations, and the Muse smoke test were done in Phase S). Each milestone ends: checks green → looked at in the browser at 390 and 1440 px → commit → push `overnight` → `bash scripts/deploy-requests.sh run overnight` (preview) → E2E on the preview URL → update draft PR → `milestone` post → dashboard → README → `judge` run. Targets are hours after `runStart` in `docs/RUN.json`. If time is short, cut from the bottom of the current milestone, never from Out Here P0.

| # | Target | Work | Who |
|---|---|---|---|
| M1 | +0:45 | Full image generation, seed content JSON, `npm run seed` on dev, `seed:demo` on demo; contracts in `src/shared/` (kit types + FB types + `canSee`) | main |
| M2 | +1:45 | FB-P0 shell, Feed, Profile, Friends, Notifications | builder **fb** |
| M2 | +1:45 | Muse pipeline: parse (Ember) → candidates (code) → rank/explain (Spark) → validate, with `muse_runs` logging and fixtures | builder **muse** |
| M2 | +1:45 | Out Here map tab (MapLibre + OpenFreeMap, overhead view), Friends/Explore toggle, quest pins with live seat counts, quest sheet, "I'm free" composer | builder **map** |
| M3 | +2:45 | Integrate all three. Invites as notifications, Accept, and `join_quest`. Live seats over Broadcast in two tabs. Playwright `demo.spec.ts` drives the full flow with two personas. **P0 checkpoint on the preview URL with real Muse.** | main + e2e-verifier |
| M4 | +3:45 | Group page Hangouts tab; FB-P1 Messenger (invites as messages), Events, Search | builder **fb** |
| M4 | +3:45 | Kit P1: "We're done" → photo → crew album with Muse caption → "Do this again" | builder **memories** |
| M4 | +3:45 | Tilted walking view with 3D buildings (plan section 2, "Map, in two steps"). Only after the M3 checkpoint passes; cut first if M4 runs late. | builder **map** |
| M5 | until freeze | Kit P2 (Daily Quest with vision check, weekly streak, Wrapped), then FB-P2 (Marketplace, Reels), polish, and a reviewer pass on the full diff | builders + reviewer |
| M6 | freeze → handoff | Fixes only. `seed:demo`. Final e2e on the preview URL. `docs/HANDOFF.md` and `docs/DEVPOST.md` (below), screenshots, README final, board `done`. | main |

**CHECKPOINT: P0 complete at M3.** If you are past +3:30 (45 min past the M3 target) and P0 isn't green on the preview URL, stop all new work and fix P0 only.

**M6 handoff docs.**
- `docs/HANDOFF.md`: preview URL, how to reset the demo (`npm run seed:demo`), what works, what doesn't, known issues + workarounds, every row of `.verify/failures.jsonl`, the `judge` scores per milestone, exact click-by-click **demo script (5 min)** with spoken lines, **Q&A prep** (safety, privacy, why Facebook, why AI, overlap with Partiful/Bumble BFF/Meetup, cost/latency from `muse_runs`, what's next), and the morning to-do list for humans (promote the preview, merge PR, make the repo public, record video, submit Devpost).
- `docs/DEVPOST.md`: name, tagline (≤ 60 chars), inspiration, what it does, how we built it (call out Muse tiers and the parse→candidates→rank→validate pipeline), challenges, accomplishments, what we learned, what's next, built-with list.
- 6–8 clean screenshots at 390 and 1440 px into `docs/screenshots/` (seeded fictional data only).
- Update the draft PR description to a full summary. Post `done` on the board with links. Final dashboard.

## The work loop (repeat until handoff)
1. Check the time → if past freeze, jump to M6 rules. If within 30 min of a milestone target and it's not close, cut scope inside that milestone (log in DECISIONS) rather than slipping the next one.
2. `bash scripts/board.sh read` → handle messages (prefix rules in 30-board). `bash scripts/deploy-requests.sh list` → `run <branch>` for each open request.
3. Open `docs/PLAN.md` → pick the next task. If it's parallelizable and > ~30 min of work in a separate owner area, brief a builder subagent; otherwise do it yourself.
4. Do the task. Run the checks. **Look at it in the browser** (Claude in Chrome, or Playwright screenshots if Chrome is disconnected).
5. Commit. Append to `docs/PROGRESS.md`. Tick `docs/PLAN.md`.
6. Every ~45 min or at a milestone: push, update PR, `status`/`milestone` post, dashboard. At a milestone also deploy the preview and run `judge`.
7. Go to 1. **Never end your turn while tasks remain.** If you must wait (blocked on a human, waiting for a subagent), start `bash scripts/board.sh wait 60 1500` in the background and continue other work; if there is nothing else to do, end the turn and the background job will wake you. The `/loop` and a 30-minute session cron resume you if a turn dies.

## Subagent playbook
Workflow and worktree rules are in `.claude/rules/20-workflow.md` (own worktree under `C:/oh-wt/<name>`, `PORT=31xx`, `MUSE_MOCK=1`, MemoryStore; self-review loop of at most 3 rounds). Brief templates (fill in the blanks, keep them specific):

**Builder brief**
> You are the **{area}** builder for Out Here (a Facebook web app with an Out Here tab, for a hackathon). Read `CLAUDE.md`, `MVP-BUILD-PLAN-itr-1.md` sections 4 and 5, and `.claude/rules/` first. Create your worktree with `git worktree add C:/oh-wt/{name} -b wt/{name} overnight` and work only there; run `npm ci`, and use `PORT={31xx}`, `MUSE_MOCK=1`, and MemoryStore (no `.env.local`). You may ONLY create/edit files under: {paths}. Do not touch `src/shared/`: implement against it exactly; if a contract seems wrong, stop and report instead of changing it. Task: {milestone slice}. Acceptance criteria: {bullet list, observable}. Run `npm run typecheck && npm run lint && npm test` (and `npm run build` at the end); all must pass. Commit on your worktree branch with conventional messages ending in the Co-Authored-By line. Do not push. Report: branch name, commits, files changed, what's done vs not, anything you had to assume.

**Review agents.** `e2e-verifier`, `reviewer`, `ui-critic`, and `judge` are defined in `.claude/agents/`. Give each the branch (or preview URL for `judge`) and the diff base. They return JSON findings; they cannot edit files.

**Muse evaluator brief**
> Run `npm run eval:muse` and inspect each failing fixture. For each: input, what Muse returned, which property failed, and a concrete prompt or schema change in `src/features/muse/prompts/` that would fix it without breaking others. Do not edit files.

Rules: ≤ 3 builders at once, different areas; ≤ 3 review agents at once. Merge only after you've run the checks yourself on their branch, the review agents found no blocker or major, and you've looked at the result.

## Blocker playbook (choose the fallback, post once, keep moving)
| Problem | Fallback |
|---|---|
| No `MUSE_API_KEY` | Build everything in mock mode behind the adapter. `blocked`: "Put the Muse key in .env.local as MUSE_API_KEY and in Vercel; adapter is `src/features/muse/client.ts`." Recheck every loop. |
| Muse API errors / rate-limited / 504 | Exponential backoff, cache responses, stream long calls (non-streaming long calls can 504), use Ember for parse; if down > 20 min, `alert` and keep developing in mock. |
| Muse latency makes the demo feel slow | Measure it, then try Spark `minimal`, then Ember for ranking. Log each result in `docs/DECISIONS.md`. |
| No Supabase env | MemoryStore + BroadcastChannel for live updates (works in two tabs of one browser). `blocked` with the env names needed (see `.env.example`). |
| Supabase migration fails | Fix SQL; never drop the project. Migrations use the session pooler (port 5432). If stuck 30 min, MemoryStore and `alert`. |
| `gh` not logged in / board unreadable | Keep working; log board-intended posts in `docs/PROGRESS.md` under **Board outbox**; retry each loop. Commits still go local if push fails. |
| Push rejected | `git pull --rebase origin overnight` (never force). If it's auth, keep committing locally and `blocked`. |
| `vercel deploy` fails or Vercel not linked | Read the build error and fix it. If it is auth or linking, keep going locally and `blocked` once with "run `vercel link` in the repo". Handoff notes explain `npm run build && npm start`. |
| MapLibre fails on the server (`window is not defined`) or tiles don't load | Create the map inside `useEffect` in a client component loaded with `dynamic(..., { ssr: false })`. Check the style URL `https://tiles.openfreemap.org/styles/positron` in the browser. Do not switch map libraries. |
| Playwright browsers not installed | `npx playwright install chromium` (inside repo cache). If it fails, rely on Claude in Chrome checks and note it. |
| Claude in Chrome disconnects | Post `blocked` once ("run /chrome → Reconnect") and continue with Playwright screenshots. |
| A permission prompt is denied by `no-prompt.mjs` | Log it in `docs/PROGRESS.md` under Known issues, take the default, continue. |
| Out of ideas on a bug after 30 min | Revert that area to last green, log Known issue, move on. A smaller working demo beats a bigger broken one. |

## Quality bar for anything a judge will see
- Real-feeling seeded content: specific venue names, prices, times relative to now, Muse-generated fictional faces (never real people), believable bios.
- Muse text is short, warm, specific, and references real data ("You and Maya both saved 3 local-band events this month"), never generic ("This seems like a great fit!").
- Times always relative and human ("starts in 25 min", "free till 6:00"), rendered in America/Los_Angeles.
- Zero dead buttons. If something isn't built, it isn't on screen. No `window.alert`, `confirm`, or `prompt`.
- Works at 390×844 and 1440×900. Test both.

## Never
Everything in `.claude/rules/40-safety.md`. Plus: don't wait silently, don't spend more than 30 min stuck, don't start P1 before P0 is green on the preview URL, don't let the run end without `docs/HANDOFF.md`.
