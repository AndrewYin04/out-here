#!/usr/bin/env bash
# Deploy requests: teammates comment "DEPLOY <branch>" on the deploy-requests issue;
# whoever holds the Vercel link (Andrew's laptop / the overnight agent) runs this script
# to list open requests and deploy them as Vercel PREVIEWS. See docs/DEPLOYS.md.
#
#   scripts/deploy-requests.sh list          open requests (team logins only, not yet answered)
#   scripts/deploy-requests.sh run <branch>  deploy origin/<branch> as a preview, reply with the URL
#
# Needs: gh (logged in), jq, vercel CLI (logged in), and .vercel/project.json in the repo root.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/scripts/board.config"
STATE="$ROOT/.board/deploys-done"
conf() { sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$CONFIG" | tail -n 1 | sed 's/[[:space:]]*$//'; }
REPO="$(conf REPO)"; ISSUE="$(conf DEPLOY_ISSUE)"; TEAM_LOGINS="$(conf TEAM_LOGINS)"
die() { echo "deploy-requests: $*" >&2; exit 1; }
[[ -n "$REPO" && -n "$ISSUE" && -n "$TEAM_LOGINS" ]] || die "REPO, DEPLOY_ISSUE and TEAM_LOGINS must be set in scripts/board.config"
mkdir -p "$(dirname "$STATE")"; touch "$STATE"

# Branch names must look like normal git branches: no spaces, no shell metacharacters, no "..".
valid_branch() { [[ "$1" =~ ^[A-Za-z0-9._/-]{1,100}$ && "$1" != *..* && "$1" != -* ]]; }

open_requests() {
  # Prints "<comment_id> <login> <branch>" for each teammate comment whose first word is DEPLOY.
  gh api "repos/$REPO/issues/$ISSUE/comments" --paginate \
    --jq '.[] | [.id, .user.login, (.body | gsub("\r";"") | split("\n")[0])] | @tsv' |
  while IFS=$'\t' read -r id login first; do
    [[ ",$TEAM_LOGINS," == *",$login,"* ]] || continue
    read -r word branch _ <<<"$first"
    [[ "${word^^}" == "DEPLOY" ]] || continue
    grep -qx "$id" "$STATE" && continue
    echo "$id $login ${branch:-<missing>}"
  done
}

case "${1:-}" in
  list)
    open_requests
    ;;
  run)
    branch="${2:?usage: deploy-requests.sh run <branch>}"
    valid_branch "$branch" || die "refusing branch name: $branch"
    [[ -f "$ROOT/.vercel/project.json" ]] || die "no .vercel/project.json; run 'vercel link --yes --project out-here' in the repo root"
    git -C "$ROOT" fetch -q origin "$branch" || die "origin has no branch $branch"
    wt="$(mktemp -d)/deploy-$RANDOM"
    git -C "$ROOT" worktree add -q --detach "$wt" "origin/$branch"
    trap 'git -C "$ROOT" worktree remove --force "$wt" >/dev/null 2>&1 || true' EXIT
    mkdir -p "$wt/.vercel" && cp "$ROOT/.vercel/project.json" "$wt/.vercel/"
    sha="$(git -C "$wt" rev-parse --short HEAD)"
    if url="$(cd "$wt" && vercel deploy --yes 2>/dev/null | tail -n 1)" && [[ "$url" == https://* ]]; then
      msg="✅ Deployed \`$branch\` @ \`$sha\` (preview): $url"
    else
      msg="❌ Deploy of \`$branch\` @ \`$sha\` failed. Andrew: run \`vercel deploy --yes\` on that branch to see the build log."
    fi
    gh issue comment "$ISSUE" --repo "$REPO" --body "$msg" >/dev/null
    # Mark every open request for this branch as answered.
    open_requests | awk -v b="$branch" '$3==b {print $1}' >>"$STATE"
    echo "$msg"
    ;;
  *)
    sed -n '2,9p' "$0"; exit 1 ;;
esac
