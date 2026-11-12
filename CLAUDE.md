# Out Here — agent instructions

Out Here is built for the **Facebook Closer Together AI Hackathon 2026** (deadline Fri Nov 13 2026, 10:30 AM PT). The product is a working Facebook web app with fictional people; Out Here is one tab in it: a live map of nearby plans you can join right now. **Muse** turns "I'm free" into a real plan with a friend and a chance to meet new people.

**`MVP-BUILD-PLAN-itr-1.md` is the master plan. It overrides `docs/MASTER_PROMPT.md` and the rest of the kit where they differ.**

The rules for every agent and subagent working in this repo live in `.claude/rules/`. Claude Code loads them automatically; if you can't see them in your context, read all five before doing anything:

- `.claude/rules/00-mission.md` — product scope, Out Here P0/P1/P2 and FB-P0/P1/P2 tiers, what's cut, safety model
- `.claude/rules/10-architecture.md` — stack, folder ownership, shared contracts, identity, data access, realtime, data model, Muse pipeline, UI direction
- `.claude/rules/20-workflow.md` — branches, deploys, commits, definition of done, progress files, subagents, review loops
- `.claude/rules/30-board.md` — the pinned GitHub issue the team uses to talk to you
- `.claude/rules/40-safety.md` — secrets, what you must never do, rate limits

The overnight run follows `MVP-BUILD-PLAN-itr-1.md` section 7 and `docs/MASTER_PROMPT.md`. Current state lives in `docs/PLAN.md` and `docs/PROGRESS.md`; read them after any restart or context summary.

The Muse API reference lives in `docs/muse-api.md`. Never guess Muse endpoints, model IDs or parameters; use only what that file says. Without `MUSE_API_KEY`, use mock mode and post a `blocked` on the board.

## Essential commands
```
npm run dev              # local app (builders: PORT=31xx, MUSE_MOCK=1)
npm run build
npm run typecheck
npm run lint
npm test                 # Vitest
npm run test:e2e         # Playwright demo flow
npm run seed             # seed the DATA_TARGET project (dev)
npm run seed:demo        # reseed out-here-demo (milestones and handoff only)
npm run db:migrate:dev   # apply migrations to out-here-dev
npm run eval:muse        # Muse fixtures against the real API
npm run gen:images       # Muse portraits and content images (cached, capped)
bash scripts/board.sh read
bash scripts/deploy-requests.sh list
```

Deploys run only from Andrew's laptop: teammates request one by commenting `DEPLOY <branch>` on pinned issue #4. Details: `docs/DEPLOYS.md`.
