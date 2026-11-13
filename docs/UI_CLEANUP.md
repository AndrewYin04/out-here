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

## Deferred: the files are claimed or being edited

Each item names its owner. Apply these when that work lands.

### Map controls

**Where:** `OutHereView.tsx`, `World3D.tsx`. **Owners:** #56 (Alan), and Codex's Phase 3–5 branches. Codex also has uncommitted edits to `World3D.tsx`.

The 3D view shows 11 controls at once. Proposed classification:

| Control | Class | Proposal |
|---|---|---|
| I'm free | Primary | Keep. Drop the ✨ from the label |
| Explore / Friends | Navigation | Keep |
| Map / 3D | Navigation | Keep. On phones, "I'm free" covers it (the bottom row overlaps at 390 px): move it above the bottom row or into the top chip row |
| Zoom + / − | Navigation | Keep on desktop; phones can pinch |
| Muse filter | Secondary | Keep, without the ✨ (the filter's status line already says Muse) |
| Your plans (calendar) | Secondary | Keep as an icon button |
| Post a plan (+) | Secondary | Keep |
| Joystick | Contextual (3D) | Keep in 3D only |
| Tour Meta HQ | Demo utility | Behind `?tools=1`; #56 already plans this |
| Demo walk / Live GPS | Demo utility | Behind `?tools=1`; #56 already plans this |
| Ask Muse / Talk to Muse (Phase 2, not on main) | Duplicate | One entry point: tap Jolly in 3D, the orb in 2D |

### Copy and emoji in the planning sheets

**Where:** `outhere/PlanSheet.tsx`, `FreeStatus.tsx`, `TogetherSheet.tsx`, `MuseSteps.tsx`, `MuseThinking.tsx`. **Owners:** #56 (Alan) and #12 (Andrew).

| Location | Text now | Proposed text |
|---|---|---|
| `PlanSheet.tsx:317` | ✨ Find plans | Find plans |
| `PlanSheet.tsx:111` | ✨ I'm free | I'm free |
| `PlanSheet.tsx:130` | ✨ Asked your friends' Muse · … | Asked your friends' Muse · … |
| `MuseSteps.tsx:31` | ✨ Muse is working | Muse is thinking… |
| `FreeStatus.tsx:276` | ✨ Asking… | Asking… |
| `FreeStatus.tsx:326` | ✨ Muse is asking everyone… | Muse is asking everyone… |
| `FreeStatus.tsx:353` | ✨ Muse picked N options… | Muse picked N options… |
| `TogetherSheet.tsx:186` | It's a plan! | It's a plan |
| `TogetherSheet.tsx:175` | 🎉 ✨ burst | The quest emoji only, as `motion.ts` now does |

Two structural problems:

- **Timed fake steps:** `MuseStepsLoading` steps through labels on a 600 ms timer, whatever Muse is actually doing. Replace it with one status line, as the create sheet now does. `MuseStepsDone`, which shows real steps, can stay.
- **Mood chips:** `PlanSheet` lists 9 mood chips with emoji next to the duration chips, all at equal weight. Show the duration first and the moods as text chips, or fold moods behind "Add a mood".

### Muse output

**Where:** `SuggestionCard.tsx`. **Owners:** #12 (Andrew) and Codex, who has uncommitted edits to this file.

| Location | Text now | Proposed change |
|---|---|---|
| `SuggestionCard.tsx:214` | ✨ Why Muse picked this | Why Muse picked this |
| `SuggestionCard.tsx:84` | Invite burst 💌 ✨ | Remove it; the "Invite sent" state already confirms |

### 3D speech

**Where:** `World3D.tsx`. **Owners:** Codex and #45 (Alan).

| Location | Text now | Proposed text |
|---|---|---|
| `World3D.tsx:143` | Hi Alex! Tap ✨ I'm free… | Hi Alex. Tap me if you want a plan. |
| `World3D.tsx:289` | You're in! … | You're in. … |
| `World3D.tsx:717–763` | 🚶 📍 🏢 🕹️ 📡 on buttons | Remove the emoji; the words carry the meaning |

### Plan page

**Where:** `map/event/PlanPage.tsx`. **Owner:** `wt/event-intro`.

| Problem | Proposed change |
|---|---|
| The group name appears twice next to each other: the visibility chip, then the group link | Drop the link text or the chip text for Group plans |
| Toast "You're checked in. Have fun!" | "You're checked in." |

### Elsewhere

| Item | Owner and reason |
|---|---|
| Memories capture burst (📸 ✨ 💛) in `memories/MemoryCapture.tsx` | #47 (Alan) |
| Messenger and Marketplace skeleton pages | Their own branches: `overnight` and `feat/marketplace-pickup` |
| Top bar search sends people to the Search page, which has no results yet | #29 (free): render `/api/search` results there |

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
