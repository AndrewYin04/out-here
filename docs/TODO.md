# After tonight's run

Work deliberately left out of the overnight build. Do these after the morning handoff.

## Deploy on every push with GitHub Actions

**Why:** the Vercel project is linked only from Andrew's laptop, so today a branch deploys only
when someone comments `DEPLOY <branch>` on issue #4 and that laptop answers (`docs/DEPLOYS.md`).
A workflow that deploys on every push removes that bottleneck and needs no Vercel seat per teammate.

**Steps:**
1. Andrew creates a Vercel token: Vercel → Account Settings → Tokens, scoped to the "Andrew's projects" team.
2. Andrew adds three repo secrets under GitHub → out-here → Settings → Secrets and variables → Actions:
   - `VERCEL_TOKEN`: the token from step 1;
   - `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`: the `orgId` and `projectId` values from `.vercel/project.json` on Andrew's laptop.
3. Add `.github/workflows/vercel-preview.yml` that runs on `push` (all branches): checkout,
   `npm i -g vercel@latest`, `vercel pull --yes --environment=preview --token=$VERCEL_TOKEN`,
   `vercel build --token=$VERCEL_TOKEN`, `vercel deploy --prebuilt --token=$VERCEL_TOKEN`, and post
   the preview URL as a commit comment or on the PR. Check the current Vercel docs for the exact
   commands before writing it.
4. Push a test branch, confirm the preview URL appears, then update `docs/DEPLOYS.md` and README
   ("pushing deploys") and retire issue #4 and `scripts/deploy-requests.sh`.

**Keep:** previews only from the workflow. Production stays a manual promote.
