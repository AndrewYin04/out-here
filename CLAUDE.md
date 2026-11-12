# Out Here — agent instructions

Out Here is a live Facebook map of nearby plans you can join right now, built for the **Facebook Closer Together AI Hackathon 2026** (deadline Thu Nov 13 2026, 10:30 AM PT). **Muse** turns "I'm free" into a real plan with a friend and a chance to meet new people.

The rules for every agent and subagent working in this repo live in `.claude/rules/`. Claude Code loads them automatically; if you can't see them in your context, read all five before doing anything:

- `.claude/rules/00-mission.md` — product scope, P0/P1/P2 tiers, what's cut, safety model
- `.claude/rules/10-architecture.md` — stack, folder ownership, shared contracts, data model, Muse pipeline, UI direction
- `.claude/rules/20-workflow.md` — branches, commits, definition of done, progress files, subagents
- `.claude/rules/30-board.md` — the pinned GitHub issue the team uses to talk to you
- `.claude/rules/40-safety.md` — secrets, what you must never do, rate limits

The overnight run follows `docs/MASTER_PROMPT.md`. Current state lives in `docs/PLAN.md` and `docs/PROGRESS.md` — read them after any restart or context summary.

The Muse API reference lives in `docs/muse-api.md`. Never guess Muse endpoints, model IDs or parameters — use only what that file says, and if it's still a placeholder, use mock mode and post a `blocked` on the board.
