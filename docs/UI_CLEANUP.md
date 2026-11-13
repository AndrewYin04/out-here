# UI cleanup (Phase 5.5): what changed, what is deferred

Branch `feature/ui-cleanup`, cut from `origin/main` (4eb3cc8). Rules: `.claude/rules/50-design-standards.md` (on `chore/out-here-design-rules`), plus the `deslop-ui`, `deslop-copy`, `anti-slop-design`, `frontend-design` and `web-design-guidelines` skills.

## Changed

| Change | Files |
|---|---|
| Events (Discover), Search and Saved showed skeleton loaders forever. They now say what is true and give one next step (the map, Friends) | `src/app/(fb)/events/page.tsx`, `search/page.tsx`, `saved/page.tsx` |
| **Post a plan:** visibility choices use line icons instead of 🌍 👥 🤝 🔒 | `src/features/map/visibility.ts`, `map/event/parts.tsx` |
| **Post a plan:** "✨ Draft" becomes "Draft" | `src/features/map/create/CreatePlanSheet.tsx` |
| **Post a plan:** the timed fake steps become one "Muse is drafting your plan…" line | same file |
| **Post a plan:** poster, map note and details are folded behind one link, which opens by itself when Muse fills one in | same file |
| Joining a plan bursts only the quest's emoji (no ✨ 🎉 confetti); the avatar still flies onto the pin | `src/features/ui/motion.ts` |
| Home feed Out Here card: one "I'm free" button (the rows above already open the map), and a quieter seat badge in the existing seat style | `src/features/fb/feed/OutHereCard.tsx` |
| Visible keyboard focus on search, comment and post fields (`focus-within` on pill containers, `focus-visible` on fields) | `fb/feed/Comments.tsx`, `fb/friends/FriendsView.tsx`, `fb/friends/ListsManager.tsx`, `fb/profile/ProfileView.tsx`, `fb/shell/SectionNav.tsx`, `fb/groups/GroupPage.tsx`, `fb/groups/PostPage.tsx`, `fb/profile/EditProfileModal.tsx` |
| E2E tests updated for the new heading and the folded extras | `tests/e2e/shell.spec.ts`, `tests/e2e/create-event.spec.ts` |

### Kept on purpose

- Facebook's 7 reaction emoji, which are the product.
- Activity emoji on quests: category markers and data.
- The "✨ Muse" label, which rule 10 requires on Muse output.
- The red Live dot.
- Seeded posts: fictional users' own words.

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
| Messenger and Marketplace skeleton pages | their own pages | Their own branches |
| Search results (the page says it isn't available) | Search page | #29 |
| The "both free" nudge card covers the top of the 3D view on phones | `BothFreeNudge` | It is a demo scene, so it was left as is |

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
