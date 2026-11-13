# Deploys

The Vercel project `out-here` (team "Andrew's projects") is linked from **Andrew's laptop** with
`vercel link`. It is **not** connected to GitHub: the Vercel login's GitHub identity cannot see
`AndrewYin04` repos. So **pushing a branch does not deploy it.** Every deploy runs from that laptop.

## Getting your branch deployed (teammates and their agents)

1. Push your branch to `origin`.
2. Comment on the pinned issue **#4 "Deploy requests"** with a first line of exactly:
   ```
   DEPLOY your-branch-name
   ```
   Only comments from the logins in `TEAM_LOGINS` (`scripts/board.config`) count.
3. A reply on #4 gives the preview URL, or says the build failed.

Agents on teammates' machines: do not run `vercel` yourself (you are not linked to the project).
Push, post the `DEPLOY` comment with `gh issue comment 4 --repo AndrewYin04/out-here --body "DEPLOY <branch>"`,
then poll #4 for the reply (`gh issue view 4 --repo AndrewYin04/out-here --comments`).

## Answering requests (Andrew's laptop / the overnight agent)

```
bash scripts/deploy-requests.sh list           # open requests: "<comment_id> <login> <branch>"
bash scripts/deploy-requests.sh run <branch>   # preview-deploys origin/<branch>, replies on #4
```

`run` checks out `origin/<branch>` in a temporary git worktree, copies `.vercel/project.json`
into it, runs `vercel deploy --yes`, posts the URL on #4, and records the answered comment ids in
`.board/deploys-done` (gitignored). Branch names with spaces or shell characters are refused.

The overnight agent runs `list` at every work-loop iteration and handles requests in order.
Its own milestone deploys use the same command on the `overnight` branch.

## Rules

- Previews only. Never `vercel deploy --prod` overnight; production is promoted by hand at handoff
  (Vercel dashboard → Deployments → the chosen preview → Promote).
- **Previews read the dev database; only Production reads demo.** Since about 1 AM PT on Fri Nov 13 the
  Preview environment has `DATA_TARGET=dev` and the three `_DEV` Supabase variables, and Production
  has `DATA_TARGET=demo` and the plain demo variables. Previews built before then still point at
  demo. Check which one a deployment uses with `curl <url>/api/realtime/config`: the `url` field
  names the Supabase project.
- Because previews and Production read different databases, a migration has to be applied to both
  (`npm run db:migrate:dev` and `npm run db:migrate:demo`) before a preview is promoted.
- Muse (`MUSE_*`) and `DEMO_RESET_TOKEN` are the same in both environments.
- Env vars live in Vercel → out-here → Settings → Environment Variables (Production and Preview).
  Ask Andrew to add or change one; never put secrets in a comment. A Vercel env change reaches only
  deployments built after it: redeploy (or promote a new preview) to pick it up.
