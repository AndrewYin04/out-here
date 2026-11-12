# Progress log (append-only, PT)

- 02:05 Thu — Run started in the setup session (Andrew present for the first minutes). Branch `overnight` cut from main@0c294b9. Wrote .claude/hooks (guard, no-prompt, log-failures; guard unit-tested 10 block + 9 allow cases), .claude/agents (e2e-verifier, reviewer, ui-critic, judge). Settings with hooks handed to Andrew to copy (classifier blocks Claude editing settings.json). Phase S workflow launched.

## Known issues
- Worktree isolation for subagents fails on this machine (path case c: vs C:). Builders create their own worktrees under C:/oh-wt/<name>.
- Claude cannot edit .claude/settings.json (auto-mode classifier: self-modification). Settings changes need a human.

## Judge scores
(none yet)
- 03:25 Thu — Preview deploy pipeline works after vercel.json framework=nextjs (repro: build ok then STATIC_BUILD_NO_OUT_DIR). Preview 37d714b: https://out-here-n7qwhjznv-andrews-projects-76721bc6.vercel.app (behind Vercel SSO; posted blocked). M1 workflow running (data + content agents, then seed+verify).
- 04:00 Thu — M1 done (a10117a): schema on dev+demo, storage buckets on both, dev+demo seeded (62 profiles, 300 posts, 20 threads, 23 quests), demo story verified on dev (docs/evidence/M1-seed.md). Portraits checked by eye (realistic, varied). Muse image run still finishing (stories/events/listings). Playwright gets E2E_PORT/E2E_BASE_URL + desktop project (f52cdc0).
- 04:00 Thu — M2 split: M2a = data layer + Muse pipeline + FB shell/UI kit (parallel builders in C:/oh-wt/*, verify/fix loop up to 3 rounds); M2b = FB surfaces + Out Here map on top. Reason: no data layer existed yet (plan assumed the kit M1 data builder).
- 03:10 Thu — Known: AskUserQuestion is auto-denied while .verify/ARMED exists (by design); ask humans on the board or in chat text instead.
