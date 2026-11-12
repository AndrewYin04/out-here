# Decisions

- 2026-11-12 Thu 02:05 PT: Run has ~29h before the 07:00 Fri freeze, not the 4.5h the plan assumed; milestone targets rescaled in docs/PLAN.md and docs/RUN.json.
- Vercel deploys from the CLI (`vercel deploy --yes`, previews only); the project is not connected to GitHub (see docs/DEPLOYS.md).
- `gh pr merge` was moved from deny to allow in .claude/settings.json by Andrew; the kit rule "never merge into main" still applies to the agent.
