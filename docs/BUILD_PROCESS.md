# How the overnight build was run

This is the process the team used during the hackathon, moved out of the README so the product docs stay about the product. It is history. The app does not need any of it to run.

One Claude Code agent built from [`MASTER_PROMPT.md`](MASTER_PROMPT.md), with subagents for parallel work. The team talked to it through a pinned GitHub issue (the board) from their phones.

The deadline was **Friday Nov 13, 2026, 10:30 AM PT**.

## Deploys

Pushing a branch does not deploy it. The Vercel project was linked only from Andrew's laptop. To get a preview URL, push the branch and comment `DEPLOY <branch>` on pinned issue [#4](https://github.com/AndrewYin04/out-here/issues/4). Details: [`DEPLOYS.md`](DEPLOYS.md).

## How the pieces fit

| File | Purpose |
|---|---|
| [`MASTER_PROMPT.md`](MASTER_PROMPT.md) | The agent's run book: deadlines, milestones M0–M7, work loop, subagent briefs, blocker fallbacks, handoff |
| [`../CLAUDE.md`](../CLAUDE.md) | Loaded by every agent; points at the rules |
| [`../.claude/rules/`](../.claude/rules/) | Mission and scope, architecture and ownership, git workflow, board protocol, safety |
| [`../scripts/board.sh`](../scripts/board.sh) | The agent's way to read and post on the board issue |
| [`../scripts/board.config`](../scripts/board.config) | Board issue number, team logins, on-call login |
| [`muse-api.md`](muse-api.md) | Muse API reference. The key stays in `.env.local` and Vercel |
| `PLAN.md`, `PROGRESS.md`, `DECISIONS.md` | Written by the agent overnight, as memory across context resets |
| `HANDOFF.md` | Written before morning: what worked, the demo script, known issues |

## Timeline

Hours after kickoff. The agent was supposed to rescale to the real start and the 07:00 PT freeze.

| When | Milestone |
|---|---|
| +0:00 | Kickoff, **M0** scaffold |
| +0:45 | **M1** contracts, Supabase schema and seed, Muse pipeline |
| +1:30 | **M2** map, Explore/Friends, "I'm free" to Muse suggestions, live seats |
| +3:00 | **M3** invite loop, end-to-end test, real Muse on a deployed preview. P0 checkpoint |
| +3:45 | **M4** photo prompt, crew album, "do this again", create-a-quest |
| +5:00 | **M5** Daily Quest, weekly streaks, Wrapped (cut first if short on time) |
| until 07:00 PT | **M6** polish, demo controls, review pass. 07:00 PT feature freeze |
| 07:00–08:00 PT | **M7** fixes only, handoff, screenshots, final PR |

## Preflight

Run on the agent's laptop until it says **Ready for kickoff**. It checks the list below and prints only names, never secret values:

```bash
scripts/preflight.sh
```

**Accounts and access (one person each, that night):**

- [ ] **Repo:** Andrew adds all teammates as collaborators on `AndrewYin04/out-here`. Turn on branch protection for `main` (require a PR) so the agent cannot push there.
- [ ] **Muse:** paste the API docs into [`muse-api.md`](muse-api.md) (endpoints, auth, model ids for Spark/Wonder/Ember, JSON output, image support, rate limits). The key goes only in `.env.local` and Vercel.
- [ ] **Supabase:** create a project. Put URL, anon key, and service-role key in `.env.local`. Create a public Storage bucket `memories`.
- [ ] **Vercel:** import the repo, add the same env vars (Production and Preview), confirm a preview deploy builds.
- [ ] **Board:** fill `TEAM_LOGINS` (all 5 GitHub logins) and `ONCALL` in [`../scripts/board.config`](../scripts/board.config), then run `scripts/board.sh init` once and commit the config.
- [ ] Merge the setup branch (`setup/overnight-agent`) into `main` so the agent starts from it.

**The agent's laptop:**

- [ ] Node 20 or newer at the time, `gh` logged in with write access, `jq`. The app itself now requires Node 22 (`package.json` engines).
```bash
gh auth login
```
- [ ] `.env.local` filled (see `.env.example`). Test the board:
```bash
scripts/board.sh post status "preflight test — ignore"
scripts/board.sh read
```
- [ ] Plugged in, sleep disabled:
```bash
caffeinate -dimsu
```
- [ ] In the Claude desktop app: open a session in this repo, model Opus, high effort, Auto permission mode. The project allowlist in `.claude/settings.json` blocks pushes to `main`, force-pushes, reading `.env` files, and destructive commands.
- [ ] Turn off the laptop's automatic OS updates for the night.

## Kickoff

In the session, send:

```
/loop Follow docs/MASTER_PROMPT.md exactly. If docs/PROGRESS.md exists, you are resuming: re-read the plan and progress files and continue from where you left off.
```

`/loop` with no interval lets the agent pace itself and restarts it after every turn, so the run survives turn endings and context summaries. If the session stops, send the same line again. The agent resumes from `PROGRESS.md`.

## Talking to the agent overnight

Comment on the pinned board issue. The agent was set to check at least every ~20 minutes and to wake on new comments when it was waiting.

| Start the comment with | Effect |
|---|---|
| `STOP` | Commits what's green and pauses until the next comment |
| `PRIORITY: …` | Re-plans to do this next |
| `ANSWER: …` | Answers a question the agent asked |
| `FYI: …` | Context, for example the demo venue |

The agent posts `status` hourly and `milestone` when something ships. `question`, `blocked`, and `alert` posts @mention the on-call teammate. Every question includes the default the agent will take and when, so nobody has to wake up for it to keep going. The issue body is a live dashboard.

You can also type directly in the agent's session on the laptop.

Daytime coordination after that night moved to [`TEAM.md`](TEAM.md) and `scripts/team.sh` (tracker issue #33).

## Morning checklist

1. Read `HANDOFF.md` and the board dashboard.
2. Open the deployed preview and run the demo script twice (two devices: Alex and Maya).
3. Review and merge the overnight PR.
4. Record the demo video from the script in `HANDOFF.md`.
5. Submit, using the public repo link, before 10:30 AM PT.

The later, rehearsed stage script (the 45-minute boba walk, the thrift pop-up, the photo) is [`DEMO_GUIDE.md`](DEMO_GUIDE.md). The scene list the team prioritized against is [`DEMO_FLOW.md`](DEMO_FLOW.md).

## Demo script (5 min)

This is the original overnight script, kept as the agent left it. The stage script that was actually rehearsed is the one in `DEMO_GUIDE.md`.

1. **(0:00–0:30) Hook.** "You moved to a new city. You've got 40 minutes free and you'd love to spend it with someone, but by the time the group chat answers, it's gone."
2. **(0:30–3:00) Live.** As Alex: "I'm free — hungry, 40 min, under $15." Muse checks who's free, returns suggestions with reasons, and the top one joins Maya's free window with the dumpling plan (2 seats left, 9 min walk). Invite Maya. Second device as Maya: accept. Both maps: seats drop to 1 live.
3. **(3:00–4:00) After.** Host taps "We're done", photo together, shared crew album with a Muse caption, "Do this again", and Muse proposes a later plan that fits the group.
4. **(4:00–5:00) Why.** Why Facebook (friends, groups, and events, in the moment), why AI (parse, fit, match, explain, coordinate), safety by design, and what would bring people back.

**Q&A prep** (answers were meant to land in `HANDOFF.md`): stranger safety, privacy of availability, how it differs from event apps, what happens with 500 pins, Muse latency and cost, cold start on a new campus.
