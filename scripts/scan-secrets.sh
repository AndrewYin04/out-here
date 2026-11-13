#!/usr/bin/env bash
# Fails if added lines look like credentials. Prints file and pattern, never the value.
#   bash scripts/scan-secrets.sh              # staged changes (run before every commit)
#   bash scripts/scan-secrets.sh <rev-range>  # e.g. origin/main..HEAD (run before a PR)
# Share links count: a Vercel ?_vercel_share= token opens a protected deployment.
set -euo pipefail
range="${1:-}"
if [[ -n "$range" ]]; then diff="$(git diff --unified=0 "$range")"; else diff="$(git diff --cached --unified=0)"; fi

PATTERNS=(
  '_vercel_share=[A-Za-z0-9_-]{8,}'
  'vca_[A-Za-z0-9]{16,}'
  'VERCEL_TOKEN=[^[:space:]<]{8,}'
  'sb_secret_[A-Za-z0-9_-]{8,}'
  'SUPABASE_SERVICE_ROLE_KEY=[^[:space:]<]{8,}'
  'MUSE_API_KEY=[^[:space:]<]{8,}'
  'sk-[A-Za-z0-9_-]{20,}'
  'gh[pousr]_[A-Za-z0-9]{20,}'
  'github_pat_[A-Za-z0-9_]{20,}'
  'eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}'
  'postgres(ql)?://[^:[:space:]]+:[^@[:space:]<]{6,}@'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
)

# Added lines, each prefixed with its file: "path<TAB>line".
# This file is skipped: its pattern list would match itself.
added="$(printf '%s\n' "$diff" | awk '/^\+\+\+ b\//{f=substr($0,7);next} /^\+/ && !/^\+\+\+/ && f!="scripts/scan-secrets.sh"{print f "\t" substr($0,2)}')"
found=0
for p in "${PATTERNS[@]}"; do
  hits="$(printf '%s\n' "$added" | grep -E -- "$p" | cut -f1 | sort -u || true)"
  if [[ -n "$hits" ]]; then
    while IFS= read -r f; do echo "scan-secrets: $f matches /$p/" >&2; done <<< "$hits"
    found=1
  fi
done

if [[ $found -ne 0 ]]; then
  echo "scan-secrets: remove the value (use a placeholder such as <ask Andrew>) before committing. Secrets live only in .env.local and Vercel." >&2
  exit 1
fi
echo "scan-secrets: clean"
