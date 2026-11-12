# 20 — Git, checks, subagents, progress files

## Branches
- The overnight build lives on branch **`overnight`** (cut from `main` at the start of the run). Push it at least **every 45 minutes** and after every milestone — pushing is the backup and triggers a Vercel preview deploy.
- Keep **one draft PR `overnight` → `main`** open and update its description at each milestone. **Never push to `main`, never merge into `main`, never force-push, never rewrite pushed history.** The team merges in the morning.
- Subagents that write code run with `isolation: "worktree"`; their work comes back on a worktree branch that the main agent reviews and merges into `overnight` (`git merge --no-ff`). Subagents never push.

## Commits
- Small, focused commits with conventional prefixes: `feat(map): …`, `fix(muse): …`, `chore(core): …`, `test(e2e): …`, `docs: …`.
- End every commit message with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Never commit `.env*` files (except `.env.example`), `.board/`, `node_modules`, build output, or real people's photos.

## Definition of done (for any task)
1. `npm run typecheck && npm run lint && npm run build` pass.
2. `npm test` (Vitest) passes.
3. If the task touches the demo flow: `npm run test:e2e` (Playwright smoke test) passes.
4. You **looked at it running** — open the dev server in the browser pane, click through, take a screenshot at phone width. A green build that looks wrong is not done.
5. `docs/PROGRESS.md` updated, commit made.

If a check fails and you can't fix it within ~20 minutes, revert to the last green commit for that area, log it in `docs/PROGRESS.md` under **Known issues**, and move on.

## Required scripts in package.json
`dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (vitest run), `test:e2e` (playwright), `seed` (seed Supabase), `eval:muse` (real-API Muse fixture run).

## Progress files (your memory — context WILL be summarized during a 7-hour run)
- `docs/PLAN.md` — the current plan: milestones with checkboxes, the next 3–5 concrete tasks, who (main or which subagent) owns each. Rewrite it whenever the plan changes.
- `docs/PROGRESS.md` — append-only log: `HH:MM PT — what was done / commit sha / what's next`. Plus a **Known issues** section kept current.
- `docs/DECISIONS.md` — one line per non-obvious decision and why (dependency added, scope cut, fallback taken).
- After any context summary or restart: re-read `CLAUDE.md`, `docs/PLAN.md`, the last 40 lines of `docs/PROGRESS.md`, `git log --oneline -15`, and `scripts/board.sh read` before doing anything else.

## Subagents
Use them for parallel, well-scoped work — not for things you can do in a few tool calls.

- **Builder** (general-purpose, `isolation: "worktree"`): one owner area, one milestone slice. Brief must include: the owner area paths it may touch, the exact contracts from `src/shared/` it implements against, acceptance criteria, the checks to run, and "commit on your branch, do not push, report the branch name, files changed, and anything you could not finish".
- **Reviewer** (general-purpose, read-only by instruction): after each milestone, review the diff for bugs that would break the demo (race on join, wrong time math, leaking exact location, crashes on empty data). Returns findings only.
- **Explorer** (Explore): look up library APIs/version compatibility (MapLibre GL JS API, Supabase realtime API, Next 15 route handler signatures).
- **Muse evaluator**: run the Muse fixtures against the real API, report failures, propose prompt fixes.
- At most **3 builders at once**, each on a different owner area. The main agent never edits a file a running builder owns.
- Never take a subagent's report as proof: check out its branch, run the checks, look at it in the browser, then merge.
- If two builders need a contract change, the main agent makes it in `src/shared/` on `overnight` first, then briefs them.
