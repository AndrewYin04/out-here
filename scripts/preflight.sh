#!/usr/bin/env bash
# Kickoff readiness check for the overnight agent. Run it on the agent's laptop
# before sending the kickoff line; the agent also runs it at startup.
# Prints names and states only — never secret values.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
fail=0; warn=0
ok()   { printf '  ✅ %s\n' "$1"; }
bad()  { printf '  ❌ %s\n     → %s\n' "$1" "$2"; fail=$((fail+1)); }
meh()  { printf '  ⚠️  %s\n     → %s\n' "$1" "$2"; warn=$((warn+1)); }
conf() { sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" scripts/board.config 2>/dev/null | tail -n 1 | sed 's/[[:space:]]*$//'; }
envset() { [[ -f .env.local ]] && grep -Eq "^[[:space:]]*$1[[:space:]]*=[[:space:]]*[^[:space:]#]" .env.local; }

echo "Out Here — overnight kickoff preflight ($(TZ=America/Los_Angeles date '+%a %H:%M PT'))"

echo; echo "Tools"
if command -v node >/dev/null; then
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [[ "$major" -ge 20 ]] && ok "node $(node -v)" || bad "node $(node -v) is too old" "install Node 20+"
else bad "node missing" "install Node 20+"; fi
command -v npm >/dev/null && ok "npm $(npm -v)" || bad "npm missing" "install Node 20+"
command -v jq  >/dev/null && ok "jq" || bad "jq missing" "brew install jq"
command -v gh  >/dev/null && ok "gh" || bad "gh missing" "brew install gh"

echo; echo "GitHub"
REPO="$(conf REPO)"
if gh auth status >/dev/null 2>&1; then
  ok "gh logged in"
  perm="$(gh api "repos/$REPO" --jq '.permissions.push' 2>/dev/null || echo error)"
  [[ "$perm" == "true" ]] && ok "push access to $REPO" || bad "no push access to $REPO ($perm)" "ask the repo owner to add you as a collaborator"
  vis="$(gh api "repos/$REPO" --jq '.visibility' 2>/dev/null || echo unknown)"
  [[ "$vis" == "public" ]] && ok "repo is public (required for submission)" || meh "repo visibility: $vis" "Devpost needs a public repo by the deadline"
  prot="$(gh api "repos/$REPO/branches/main/protection" --jq '.required_pull_request_reviews != null' 2>/dev/null || echo none)"
  [[ "$prot" == "true" ]] && ok "main is protected (PR required)" || meh "main is not protected" "Settings → Branches → protect main, require a PR"
  if git ls-remote --exit-code --heads origin setup/overnight-agent >/dev/null 2>&1; then
    if git fetch -q origin main setup/overnight-agent 2>/dev/null && git merge-base --is-ancestor origin/setup/overnight-agent origin/main; then
      ok "setup branch merged into main"
    else meh "setup/overnight-agent not merged into main yet" "merge it (or the agent branches from it and notes that)"; fi
  fi
else
  bad "gh not logged in" "run: gh auth login"
fi

echo; echo "Board (scripts/board.config)"
ISSUE="$(conf ISSUE)"; TEAM="$(conf TEAM_LOGINS)"; ONCALL="$(conf ONCALL)"
[[ -n "$TEAM" ]] && ok "TEAM_LOGINS: $TEAM" || bad "TEAM_LOGINS empty" "add all 5 GitHub logins, comma-separated"
[[ -n "$ONCALL" ]] && ok "ONCALL: $ONCALL" || meh "ONCALL empty" "set who gets @mentioned on questions/blockers"
if [[ -n "$ISSUE" ]]; then
  state="$(gh issue view "$ISSUE" --repo "$REPO" --json state --jq .state 2>/dev/null || echo unreadable)"
  [[ "$state" == "OPEN" ]] && ok "board issue #$ISSUE is open" || bad "board issue #$ISSUE: $state" "check the number or re-run scripts/board.sh init"
else
  bad "board issue not created" "run: scripts/board.sh init  (after TEAM_LOGINS is set), then commit board.config"
fi

echo; echo "Secrets (.env.local — names only)"
if [[ -f .env.local ]]; then
  for k in MUSE_API_KEY MUSE_BASE_URL MUSE_MODEL_FAST MUSE_MODEL_SMART NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
    envset "$k" && ok "$k set" || bad "$k missing" "add it to .env.local (and Vercel env)"
  done
  envset MUSE_MODEL_VISION && ok "MUSE_MODEL_VISION set" || meh "MUSE_MODEL_VISION not set" "fine if Muse has no image input; Daily Quest photo check is skipped"
  if envset NEXT_PUBLIC_SUPABASE_URL && envset NEXT_PUBLIC_SUPABASE_ANON_KEY; then
    url="$(sed -n 's/^[[:space:]]*NEXT_PUBLIC_SUPABASE_URL[[:space:]]*=[[:space:]]*//p' .env.local | tail -n1 | tr -d '"'"'"' ')"
    key="$(sed -n 's/^[[:space:]]*NEXT_PUBLIC_SUPABASE_ANON_KEY[[:space:]]*=[[:space:]]*//p' .env.local | tail -n1 | tr -d '"'"'"' ')"
    code="$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $key" "$url/auth/v1/health" || echo 000)"
    [[ "$code" == "200" ]] && ok "Supabase reachable" || bad "Supabase health check returned $code" "check the URL/anon key"
  fi
else
  bad ".env.local missing" "cp .env.example .env.local and fill it in"
fi

echo; echo "Muse docs"
if grep -q "PLACEHOLDER" docs/muse-api.md 2>/dev/null; then
  bad "docs/muse-api.md is still the placeholder" "paste the Muse API docs and remove the banner"
else ok "docs/muse-api.md filled in"; fi

echo; echo "Deploy"
[[ -f .vercel/project.json ]] && ok "Vercel project linked locally" || meh "no local Vercel link found" "fine if the repo is imported in the Vercel dashboard with env vars set — confirm a preview deploy built"

echo; echo "Laptop"
if pmset -g batt 2>/dev/null | grep -q "AC Power"; then ok "on AC power"; else bad "on battery" "plug in the charger"; fi
pgrep -x caffeinate >/dev/null && ok "caffeinate running" || bad "caffeinate not running" "run in a spare terminal: caffeinate -dimsu"

echo
if (( fail > 0 )); then
  echo "❌ $fail blocking item(s), $warn warning(s). Fix the ❌ items before kickoff."
  exit 1
fi
echo "✅ Ready for kickoff ($warn warning(s))."
