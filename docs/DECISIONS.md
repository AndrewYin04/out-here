# Decisions

- 2026-11-12 Thu 02:05 PT: Run has ~29h before the 07:00 Fri freeze, not the 4.5h the plan assumed; milestone targets rescaled in docs/PLAN.md and docs/RUN.json.
- Vercel deploys from the CLI (`vercel deploy --yes`, previews only); the project is not connected to GitHub (see docs/DEPLOYS.md).
- `gh pr merge` was moved from deny to allow in .claude/settings.json by Andrew; the kit rule "never merge into main" still applies to the agent.
- 2026-11-12 Thu 02:25 PT: Andrew: the 07:00 freeze is a soft, self-set target. The hard deadline is only the Devpost submission at Fri 10:30 PT. Freeze/handoff stay as targets (humans need time to rehearse and submit); hard stop for agent edits is 09:30 PT.
- 2026-11-12 Thu 03:00 PT: Andrew: friend locations with status bubbles ("Find My" inside Facebook) are a core Out Here feature, shown regardless of Muse matches. Added as P0 item 1a (00-mission), contract types (LocationShare, FriendPin, StatusBubble), routes in api.ts, migration 0002 (applied dev+demo). Built in M2b (map builder UI + data routes) after M2a merges.
- 2026-11-12 Thu 03:10 PT: Andrew: add Boardy-style Muse Intros (friendship, networking, dating; strict quality bar; can reach 2nd degree). Written into plan + 00-mission 1b with defaults (hookups out of demo, double opt-in, 2nd degree + shared groups, max 1/week, score>=85). Questions asked in chat; defaults stand unless he answers.
