# UI cleanup (Phase 5.5): what changed, what is deferred

Branch `feature/ui-cleanup`, cut from `origin/main` (4eb3cc8). Rules: `.claude/rules/50-design-standards.md` (on `chore/out-here-design-rules`), plus the `deslop-ui`, `deslop-copy`, `anti-slop-design`, `frontend-design` and `web-design-guidelines` skills.

## Scope

Out Here only. The Facebook demo platform (feed, profile, friends, groups, events, search, saved, Messenger) is unchanged. An earlier round touched Facebook pages; those commits were reverted at the session owner's request.

The one shared file is `fb/shell/MobileTabBar.tsx`. Its compact style applies only on `/out-here*` and `/memories`; every other page renders the tab bar exactly as before.

## Round 1 (Out Here)

| Change | Files |
|---|---|
| **Post a plan:** line icons instead of emoji on who-can-see-it | `map/visibility.ts`, `map/event/parts.tsx` |
| **Post a plan:** a plain "Draft" button | `map/create/CreatePlanSheet.tsx` |
| **Post a plan:** one honest status line instead of timed fake steps | same file |
| **Post a plan:** poster, map note and details folded until wanted | same file |
| Joining a plan bursts only the quest's emoji | `ui/motion.ts`, used only by Out Here |

## Round 2: the Out Here mobile screens (claimed files, edited at the session owner's request)

These files are claimed by #56, #45 and #12, and Codex's Phase 5 branches touch `OutHereView.tsx`, `World3D.tsx` and `SuggestionCard.tsx`. Expect merge conflicts there.

### Map (`map/OutHereView.tsx`)

- **The fix:** one bottom row (Map/3D, I'm free, Your plans, +). The old two-part Map/3D toggle sat under "I'm free" at 390 px; it is now one round button at the start of the row.
- "Muse filter" has no sparkle.

### 3D (`world/World3D.tsx`)

- **Moved behind `?tools=1`:** Tour Meta HQ and Demo walk / Live GPS. The demo walk is the default, and the switch stays visible while GPS is on.
- **Fewer emoji:** none on Walk there, the walk countdown or the arrival pill. Back to me uses a line icon.
- **Calmer Muse lines:**
  - "Hi Alex. Tap I'm free and I'll find something nearby."
  - "You're in: …"

### I'm free sheet (`outhere/PlanSheet.tsx`)

- Sentence-case labels ("For how long?", "What are you up for?") and text-only mood chips.
- **One primary action:** Find plans. "Just show I'm free" is a text button.
- **Before the first ask:** no explainer paragraph and no empty grey area. On desktop the panel fits the form.
- **Loading:** one status line instead of timed fake steps.
- **Results:** the summary, then the plans. "How Muse picked these" and "Why not others?" come last.

### Other copy and confetti (`FreeStatus.tsx`, `TogetherSheet.tsx`, `SuggestionCard.tsx`, `MuseSteps.tsx`)

- **No sparkles** on Asking…, Muse is asking everyone…, Muse picked N options, Why Muse picked this, How Muse picked these, or the I'm free button.
- **Less confetti:** "It's a plan" bursts the quest emoji only, and invites have no confetti.

### Quest sheet (`map/QuestPanel.tsx`, `map/event/parts.tsx`)

- The seat count is shown once (the stat line no longer repeats it).

### Kept on purpose

- The "✨ Muse" label on live Muse output and the "✨ Muse pick" pin tag: rule 10 asks for them.

### Still open

| Item | Where | Why it is still open |
|---|---|---|
| The group name appears twice on the plan page | `map/event/PlanPage.tsx` | `wt/event-intro` |
| Toast "You're checked in. Have fun!" | `map/event/PlanPage.tsx` | `wt/event-intro` |
| Memories capture burst | `memories/MemoryCapture.tsx` | #47 |
| The "both free" nudge card covers the top of the 3D view on phones | `BothFreeNudge` | It is a demo scene, so it was left as is |

## Round 3: the dock (Life360-style), merged with main

- **The dock** replaces the map's bottom row and the Explore/Friends toggle at the top. See `docs/OUTHERE_DASHBOARD.md`.
- **Draggable handles** on the I'm free and quest sheets.
- **Merged `origin/main` (#59, `feat/ux-journey`)** into this branch:
  - Kept main's Up Next card, Let's go, the selfie flow and `useDemoTools` (Muse filter, Tour Meta HQ and Demo walk / Live GPS only with `?tools=1`).
  - Dropped this branch's own `?tools=1` check in favour of main's.
  - Removed the ✨ and "!" from main's new hello line.
- **The 3D joystick and the right-hand column** sit above the dock on phones.

## Verification

- Typecheck, lint, all unit tests (293) and the production build pass.
- **Screenshots:** Playwright at 390, 768 and 1440 px, before and after: Home, Out Here (2D, Friends), Friends, Groups, a Group, Notifications, Profile, Memories, Menu, Events, Search, and the Post a plan sheet (closed and expanded). The 3D view was checked in a GPU browser (desktop only).
- **Full e2e suite, both builds against the same server setup:**

| Build | Failed | Passed |
|---|---|---|
| `main` | 25 | 111 |
| this branch | 22 | 114 |

- **Only failing here:** `people.spec` "Edit profile". It's flaky: re-run 3 times on each build, it passed 6/6 here and failed 1/6 on `main`.
- **Already failing on `main`:**
  - the 403 on another persona's availability (#38)
  - the feed card's link test (expects `/out-here`, but `main` uses `?free=1`)
  - a "Custom lists" sidebar row
  - others in `outhere`, `musefilter` and `findmy`
