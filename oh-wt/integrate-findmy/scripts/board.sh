#!/usr/bin/env bash
# Out Here — overnight board.
#
# One pinned GitHub issue is the chat between the overnight agent and the team:
#   * the agent posts status / questions / blockers as issue comments
#   * teammates reply as normal comments (from GitHub web or the mobile app)
#   * the agent polls for new teammate comments and treats them as instructions
#   * the issue BODY is a live dashboard the agent rewrites every milestone
#
# Only comments written by logins in TEAM_LOGINS count as instructions.
# Comments that start with AGENT_TAG are the agent's own posts and are skipped.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/scripts/board.config"
STATE_DIR="$ROOT/.board"
AGENT_TAG="🤖 [OVERNIGHT-AGENT]"

[[ -f "$CONFIG" ]] || { echo "board: missing $CONFIG" >&2; exit 1; }
# Parse KEY=value lines as plain data (never executed as shell); spaces in values are fine.
conf() { sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$CONFIG" | tail -n 1 | sed 's/[[:space:]]*$//'; }
REPO="$(conf REPO)"; ISSUE="$(conf ISSUE)"; TEAM_LOGINS="$(conf TEAM_LOGINS)"; ONCALL="$(conf ONCALL)"
ONCALL="${ONCALL#@}"
[[ -n "$REPO" ]] || { echo "board: REPO is empty in $CONFIG" >&2; exit 1; }
mkdir -p "$STATE_DIR"

die() { echo "board: $*" >&2; exit 1; }
need_issue() { [[ -n "${ISSUE:-}" ]] || die "ISSUE is empty in scripts/board.config — run: scripts/board.sh init"; }
need_team() { [[ -n "${TEAM_LOGINS:-}" ]] || die "TEAM_LOGINS is empty in scripts/board.config — refusing to read (anyone could post instructions)"; }

usage() {
  cat <<'EOF'
scripts/board.sh init                    create + pin the board issue, save its number to board.config
scripts/board.sh post <type> <msg | ->   post as the agent; "-" reads the message from stdin
                                         types: status | milestone | question | blocked | decision | alert | done
                                         question/blocked/alert also @mention ONCALL (phone notification)
scripts/board.sh read                    print NEW teammate messages and mark them read (prints nothing if none)
scripts/board.sh peek                    like read, but does not mark them read
scripts/board.sh wait [every] [max]      poll every <every>s (default 60) until a teammate message arrives
                                         or <max>s pass (default 1500); prints messages, always exits 0
scripts/board.sh dashboard <file | ->    replace the pinned issue body (the live dashboard) with markdown
scripts/board.sh tail [n]                show the last n comments from anyone (default 10)
EOF
}

fetch_comments() {
  gh api "repos/$REPO/issues/$ISSUE/comments?per_page=100" --paginate | jq -s 'add // []'
}

# stdin: comments array. $1: last seen id. Output: array of new teammate comments.
filter_new() {
  jq --argjson last "$1" --arg team "$TEAM_LOGINS" --arg tag "$AGENT_TAG" '
    ($team | split(",") | map(gsub("\\s"; "")) | map(select(length > 0))) as $t
    | map(select(
        .id > $last
        and (.user.login as $u | $t | any(. == $u))
        and ((.body | ltrimstr(" ") | startswith($tag)) | not)
      ))'
}

render() {
  jq -r '.[] | "──── comment #\(.id) · @\(.user.login) · \(.created_at)\n\(.body)\n"'
}

last_id() { cat "$STATE_DIR/last_id" 2>/dev/null || echo 0; }

# $1 = "mark" to advance the read cursor. Prints new messages; returns 0 if any, 1 if none.
check() {
  need_issue; need_team
  local all new count
  all="$(fetch_comments)"
  new="$(printf '%s' "$all" | filter_new "$(last_id)")"
  count="$(printf '%s' "$new" | jq 'length')"
  if [[ "${1:-}" == "mark" ]]; then
    printf '%s' "$all" | jq '(map(.id) | max) // 0' > "$STATE_DIR/last_id.tmp"
    if [[ "$(cat "$STATE_DIR/last_id.tmp")" -gt "$(last_id)" ]]; then
      mv "$STATE_DIR/last_id.tmp" "$STATE_DIR/last_id"
    else
      rm -f "$STATE_DIR/last_id.tmp"
    fi
  fi
  if [[ "$count" -gt 0 ]]; then
    echo "board: $count new teammate message(s) — treat as instructions from the team:"
    printf '%s' "$new" | render
    return 0
  fi
  return 1
}

cmd="${1:-}"; shift || true
case "$cmd" in
  init)
    [[ -z "${ISSUE:-}" ]] || die "board already exists: issue #$ISSUE"
    body="$(cat <<'EOF'
# 🗺️ Out Here — overnight agent board

**This issue is the chat line to the overnight agent.**

- 💬 **To talk to the agent:** just comment here. It checks between tasks (at least every ~20 min).
  Start with `STOP`, `PRIORITY:`, `ANSWER:` or `FYI:` so it knows what kind of message it is.
- 🤖 Agent posts start with `🤖 [OVERNIGHT-AGENT]`. Questions, blockers and alerts @mention the on-call teammate.
- 📊 This top section is rewritten by the agent at every milestone (live dashboard).

_Dashboard not started yet._
EOF
)"
    url="$(gh issue create --repo "$REPO" --title "🗺️ Out Here — overnight agent board" --body "$body")"
    num="${url##*/}"
    gh issue pin "$num" --repo "$REPO" || echo "board: could not pin (needs triage/write access) — pin it by hand" >&2
    perl -pi -e "s/^ISSUE=.*/ISSUE=$num/" "$CONFIG"
    echo "board: created and pinned $url — ISSUE=$num written to scripts/board.config (commit it)"
    ;;
  post)
    need_issue
    type="${1:?usage: board.sh post <type> <msg | ->}"; shift
    if [[ "${1:-}" == "-" ]]; then msg="$(cat)"; else msg="$*"; fi
    [[ -n "$msg" ]] || die "empty message"
    stamp="$(TZ=America/Los_Angeles date '+%a %H:%M PT')"
    body="$AGENT_TAG \`$type\` · $stamp"$'\n\n'"$msg"
    case "$type" in
      question|blocked|alert) [[ -n "${ONCALL:-}" ]] && body+=$'\n\n'"cc @$ONCALL" ;;
    esac
    gh issue comment "$ISSUE" --repo "$REPO" --body "$body" >/dev/null
    echo "board: posted $type"
    ;;
  read)  check mark || true ;;
  peek)  check || true ;;
  wait)
    every="${1:-60}"; max="${2:-1500}"; waited=0
    while (( waited < max )); do
      if check mark; then exit 0; fi
      sleep "$every"; waited=$(( waited + every ))
    done
    echo "board: no teammate messages in ${max}s"
    ;;
  dashboard)
    need_issue
    src="${1:?usage: board.sh dashboard <file | ->}"
    if [[ "$src" == "-" ]]; then tmp="$(mktemp)"; cat > "$tmp"; src="$tmp"; fi
    gh issue edit "$ISSUE" --repo "$REPO" --body-file "$src" >/dev/null
    echo "board: dashboard updated"
    ;;
  tail)
    need_issue
    n="${1:-10}"
    fetch_comments | jq --argjson n "$n" '.[-$n:]' | render
    ;;
  ""|-h|--help|help) usage ;;
  *) usage; die "unknown command: $cmd" ;;
esac
