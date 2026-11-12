# 20 — Git, checks, subagents, progress files

## Branches
- The overnight build lives on branch **`overnight`** (cut from `main` at the start of the run). Push it at least **every 45 minutes** and after every milestone. Pushing is the backup; it does **not** deploy.
- **Deploys are from the CLI.** The Vercel project `out-here` is linked locally (`.vercel/`) but not connected to GitHub. After each milestone push, run `bash scripts/deploy-requests.sh run overnight` (a `vercel deploy --yes` preview, never `--prod`), record the preview URL in `docs/PROGRESS.md` and on the board, and run the milestone's E2E against that URL. The humans promote the final preview at handoff.
- **Teammate deploy requests.** At every work-loop iteration run `bash scripts/deploy-requests.sh list`, then `bash scripts/deploy-requests.sh run <branch>` for each open request. The script replies on issue #4 with the URL. Details: `docs/DEPLOYS.md`.
- Keep **one draft PR `overnight` → `main`** open and update its description at each milestone. **Never push to `main`, never merge into `main`, never force-push, never rewrite pushed history.** The team merges in the morning.
- Subagents never push.

## Commits
- Small, focused commits with conventional prefixes: `feat(map): …`, `fix(muse): …`, `feat(fb): …`, `chore(core): …`, `test(e2e): …`, `docs: …`.
- End every commit message with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Never commit `.env*` files (except `.env.example`), `.board/`, `reference/`, `.verify/`, `node_modules`, build output, or real people's photos.

## Definition of done (for any task)
1. `npm run typecheck && npm run lint && npm run build` pass.
2. `npm test` (Vitest) passes.
3. If the task touches the demo flow: `npm run test:e2e` (Playwright smoke test) passes.
4. You **looked at it running**: open the dev server in Claude in Chrome, click through, and take screenshots at 390 px and 1440 px. A green build that looks wrong is not done. If Chrome is disconnected, use Playwright screenshots (Playwright is the gate; Chrome is a bonus overnight).
5. `docs/PROGRESS.md` updated, commit made.

If a check fails and you can't fix it within ~20 minutes, revert to the last green commit for that area, log it in `docs/PROGRESS.md` under **Known issues**, and move on.

## Required scripts in package.json
`dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (vitest run), `test:e2e` (playwright), `seed` (seed the `DATA_TARGET` project, dev by default), `seed:demo` (seed `out-here-demo`), `db:migrate:dev`, `db:migrate:demo`, `eval:muse` (real-API Muse fixture run), `gen:images` (Muse portraits and content images). Scripts that need secrets load them with `node --env-file=.env.local`.

## Progress files (your memory — context WILL be summarized during a 7-hour run)
- `docs/PLAN.md` — the current plan: milestones with checkboxes, the next 3–5 concrete tasks, who (main or which subagent) owns each. Rewrite it whenever the plan changes.
- `docs/PROGRESS.md` — append-only log: `HH:MM PT — what was done / commit sha / what's next`. Plus a **Known issues** section kept current, the preview URL per milestone, and each `judge` score.
- `docs/DECISIONS.md` — one line per non-obvious decision and why (dependency added, scope cut, fallback taken, measured Muse latency).
- `docs/POLISH.md` — queue of minor review findings, worked through in M5 and spare time.
- After any context summary or restart: re-read `CLAUDE.md`, `MVP-BUILD-PLAN-itr-1.md` section 7, `docs/PLAN.md`, the last 40 lines of `docs/PROGRESS.md`, `git log --oneline -15`, and `bash scripts/board.sh read` before doing anything else.

## Subagents
Use them for parallel, well-scoped work, not for things you can do in a few tool calls.

- **Builder** (general-purpose): one owner area, one milestone slice.
  - Built-in `isolation: "worktree"` is broken on this machine (path case mismatch), so each builder makes its own git worktree: `git worktree add C:/oh-wt/<name> -b wt/<name> overnight`, works only there, and commits on that branch.
  - Builders run with `PORT=31xx` (xx is the builder number), `MUSE_MOCK=1`, and MemoryStore. A worktree has no `.env.local` and no `node_modules`; builders run `npm ci` there and never copy secrets in.
  - Brief must include: the owner area paths it may touch, the exact contracts from `src/shared/` it implements against, acceptance criteria, the checks to run, its port, and "commit on your branch, do not push, report the branch name, files changed, and anything you could not finish".
- **Review agents** (in `.claude/agents/`, none has Edit or Write tools; each returns JSON findings `{id, severity: blocker|major|minor, file, repro, fix}`):
  - `e2e-verifier`: runs `npm run test:e2e` plus one exploratory two-persona flow against `out-here-dev`, and tries to refute "this works".
  - `reviewer`: reviews the slice's diff for crashes on empty data, join races, time math, location leaks, secrets in client code, dead buttons, and `window.alert`.
  - `ui-critic`: Playwright screenshots at 390 and 1440 px compared with `docs/FB_SPEC.md` and `reference/fb/`; returns the 5 most visible differences from real Facebook.
  - `product-critic`: uses the just-built feature as a real young adult would (two personas, 1440 and 390 px) and compares it with the product it imitates: Facebook via `reference/fb/` screenshots and FB_SPEC copy and wording, Find My for friend locations, Boardy for intros, smooth maps for the Out Here and 3D walking views. It returns what feels fake, confusing, low quality, or AI-decorative.
  - `judge`: scores the preview URL against the four Devpost criteria, once per milestone.
- **Explorer** (Explore): look up library APIs/version compatibility (MapLibre GL JS API, Supabase realtime API, Next 15 route handler signatures).
- **Muse evaluator**: run the Muse fixtures against the real API, report failures, propose prompt fixes.
- At most **3 builders at once**, each on a different owner area, and at most **3 review agents at once**, so review never starves the build. The main agent never edits a file a running builder owns.
- If two builders need a contract change, the main agent makes it in `src/shared/` on `overnight` first, then briefs them.

## Verification order (every builder slice)
1. The **main session** runs the checks on the builder's branch itself. A builder's report is never proof.
2. Then `e2e-verifier`, `reviewer`, and, for UI slices, `ui-critic` run on that branch in parallel in one Workflow.
3. Then merge into `overnight` (`git merge --no-ff`), and remove the worktree.

## Self-review loop (every builder slice, before merge)
1. The builder finishes. The main session runs the checks on the builder's branch.
2. Run `e2e-verifier`, `reviewer`, and, for every user-facing feature slice, `ui-critic` and `product-critic` on that branch in parallel in one Workflow. This is how every feature is reviewed as it is built: Find My, the Out Here map and 3D walking view, the Muse plan, invites and live seats, Intros, Memories, Events, Messenger, and the rest. `ui-critic` compares with `reference/fb/` screenshots (the read-only Facebook survey); when they are missing, it compares with `docs/FB_SPEC.md` and says so.
3. Turn every blocker and major finding into a fix task for the same builder, re-briefed with the findings. Reproduce each bug before fixing it.
4. Repeat steps 2 and 3 until a round returns no blocker or major, with **at most 3 rounds**. After round 3, merge what passes, revert what does not, and log it under Known issues.
5. Minor findings go to the `docs/POLISH.md` queue.

## Milestone loop (end of every milestone)
- Run `judge` on the preview URL. Its top 3 changes become the first tasks of the next milestone, unless they conflict with Out Here P0.
- Record each `judge` score in `docs/PROGRESS.md`, so the morning handoff shows whether the scores went up.
- All tests run against `out-here-dev`. `out-here-demo` changes only through `npm run seed:demo`.
