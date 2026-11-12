# Progress log (append-only, PT)

- 02:05 Thu — Run started in the setup session (Andrew present for the first minutes). Branch `overnight` cut from main@0c294b9. Wrote .claude/hooks (guard, no-prompt, log-failures; guard unit-tested 10 block + 9 allow cases), .claude/agents (e2e-verifier, reviewer, ui-critic, judge). Settings with hooks handed to Andrew to copy (classifier blocks Claude editing settings.json). Phase S workflow launched.

## Known issues
- Worktree isolation for subagents fails on this machine (path case c: vs C:). Builders create their own worktrees under C:/oh-wt/<name>.
- Claude cannot edit .claude/settings.json (auto-mode classifier: self-modification). Settings changes need a human.

## Judge scores
(none yet)
- 03:25 Thu — Preview deploy pipeline works after vercel.json framework=nextjs (repro: build ok then STATIC_BUILD_NO_OUT_DIR). Preview 37d714b: https://out-here-n7qwhjznv-andrews-projects-76721bc6.vercel.app (behind Vercel SSO; posted blocked). M1 workflow running (data + content agents, then seed+verify).
