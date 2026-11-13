# Out Here UX audit and fixes (Thu Nov 12, late)

Branch `feature/ui-cleanup`, built on Alan's `feat/plan-card` (which contains `feat/clean-ui`). Out Here only: Facebook pages are unchanged. Evidence came from a scripted user walk: start at Facebook Home, tap the Out Here tab, then use only what is on screen, at 390 × 844 and 1440 × 900 (also 320 and 768 for layout). Screenshots and logs are in the session scratchpad (`audit/base-*` before, `audit/after-*` after).

## What a first-time user hit (baseline: `feat/plan-card` at 9ad3da5)

| # | Severity | Where | What happened | Cause | Status |
|---|---|---|---|---|---|
| 1 | Critical | Friends map | The People list could not be opened at any width. Clicks landed on the Explore/Friends toggle or the map. | `<PeopleButton>` rendered with no position class, in normal flow under the map canvas. This is also why main's four `findmy.spec` People tests fail. | Fixed |
| 2 | Critical | Plan card | Browser Back from an open plan left Out Here for Facebook Home. | The plan was kept in the URL with `replaceState`, so there was no history entry to go back to. | Fixed |
| 3 | High | I'm free sheet | Escape did nothing. | No key handler (the plan card had one). | Fixed |
| 4 | High | Post a plan | Escape did nothing. | Same. | Fixed: Escape closes an empty sheet and keeps a typed draft. |
| 5 | High | "Your plans" | It left Out Here for Facebook's `/events?tab=going`. The Events "Discover" tab there is only skeleton loaders that never resolve. | Two routes for one thing: Out Here had no home for your own plans. | Fixed in Out Here (the Plans tab). The Facebook Events page is untouched. |
| 6 | High | Plan page | No way back on phones. | The back link was `hidden md:inline-flex`. | Fixed |
| 7 | High | Memories | No way back to the map except Facebook's tab bar. | No back control. | Fixed |
| 8 | High | Map | Controls sat in three places: the Explore/Friends toggle at the top, a 4-button stack on the right and I'm free in the centre, on top of Facebook's tab bar. | No single home for Out Here's controls. | Fixed: one dashboard at the bottom |
| 9 | High | Arrival / photo | Everything showed at once: a raw file input, the caption, Suggest caption (usable with no photo), the privacy line, Save, and emoji confetti twice. | One flat form. | Fixed: step by step |
| 10 | High | 3D arrival | On a slow device, 3D's slow-device fallback switches to the flat map and unmounts the selfie dialog, even mid-photo. | `ArrivalSelfie` lives inside `World3D`. | Open: Alan (arrival) or Codex (world). Lift `ArrivalSelfie` into `OutHereView`. |
| 11 | Medium | Any page | The invite card (fixed, top right, z-60) covers page buttons until it's dismissed. In the e2e run it covered Maya's "We're done". | `InviteInbox` is the scene-6 ping, and it has an X. It doesn't collapse on its own. | Open: `outhere/InviteInbox.tsx`. Consider collapsing it to a chip after a few seconds. |
| 12 | Medium | Friends map, 390 | Friend status bubbles and plan labels overlap each other. | Bubbles and labels have no collision pass across layers. | Open |
| 13 | Medium | Map, 390 | Pin labels slide under the top edge and the attribution. | Map label placement | Open, minor |
| 14 | Medium | Plan-together card | Three actions (Let's go, Show on map, Your plans) for one next step. | | Fixed: Your plans removed (it's a tab now) |
| 15 | Medium | Friends map | "Plans your friends joined · N" floated over the map. | | Moved into the Friends list header |
| 16 | Medium | Arrival | The title was cut off ("You made it to 🥏 New grad…"). | The shared Modal title truncates. | Fixed: title "You made it", with the plan name in the body. Modal unchanged (Facebook uses it). |
| 17 | Medium | `findmy.spec` | "The Out Here tab opens the Friends map" expects Friends, but `/out-here` defaults to Explore on main and every branch. | The test and the product disagree. | Open: the team decides which |
| 18 | Low | 3D | Muse's hello is back to "Hi Alex! Tap ✨ I'm free…". | The `feat/clean-ui` copy. | Open: Alan's file, and Codex is editing `World3D` |
| 19 | Low | Facebook Events | Discover is placeholder skeletons. | Facebook platform | Out of scope (Facebook unchanged). Not on stage per DEMO_FLOW. |

## The structure now

**Facebook stays the app; Out Here is one tab in it.** Facebook's top bar and tab bar are unchanged. Everything inside Out Here hangs off the map and one dashboard, so there is no second navigation bar at the top and no third level.

| Destination | What it is for | Where |
|---|---|---|
| **Explore** | Discover: every plan near you, as pins and as a list | Dashboard tab (the default). It switches the map layer. |
| **Friends** | Friends' locations and status, the People list, your own sharing (You → Edit) | Dashboard tab. It switches the map layer, and the list shows People. |
| **Plans** | What you joined (upcoming) and past hangouts, with Add a photo | Dashboard tab. Its list is Your plans, so you never leave Out Here. |
| **Memories** | Crew albums and the next plan | Dashboard link to `/memories`, which has Back to the map. |
| **Muse** | "I'm free" and the plan Muse finds | The I'm free button above the dashboard. In 3D, Jolly speaks there too. |

**Explore and Events.** In Out Here they were the same data (quests) reached by two routes, and Out Here had no screen of its own for your plans. Explore is now the one discovery destination. What Events offered that Explore did not ("Going") is the Plans tab. Facebook's Events page is left as is.

**One panel at a time.** The I'm free sheet, Post a plan and, on phones, an open plan card replace the dashboard while they are open. Up next and "You're both free" share one top slot, and only one shows.

## The dashboard (`src/features/map/OutHereDock.tsx`)

- **Above the panel:** I'm free (the one blue action), Post (Explore only), Back to you, 3D/Map.
- **Tabs:** the selected one shows icon and label on a light blue tint; the others are icon-only and keep their names for screen readers. Blue fill is reserved for I'm free.
- **Heights:** peek (tabs only, the default), half (about 40% of the screen, the tab's list) and full (the screen minus the top bar and the action row). The action row steps aside at full.
- **Input:**
  - Drag the handle; a flick counts.
  - Tap or Enter toggles peek and half; ArrowUp and ArrowDown step.
  - Escape folds the panel and returns focus to the handle.
  - Only `transform` changes while dragging, and the list height eases with one transition (none under reduced motion).
- **Map gestures** are untouched: the drag is captured on the handle only.
- **Folded list:** `inert` and `aria-hidden`.
- **Not done:**
  - Pulling down at the top of a scrolled list does not move the panel; use the handle.
  - On desktop the panel is a centred card, not the 400 px left column the design doc proposed.

## Return paths now

| From | Back control | Browser Back | Escape |
|---|---|---|---|
| Plan card (map) | X | Closes the card and stays on the map | Closes |
| Plan page | "Back to the map" at every width, reopening that plan | Previous page | n/a |
| I'm free sheet | X | n/a | Closes; focus returns to I'm free |
| Post a plan | X | n/a | Closes when empty; keeps a typed draft |
| Dashboard list | Handle | n/a | Folds; focus to the handle |
| People → friend card | X | n/a | Closes |
| Arrival selfie | X, and "Back to the map" after saving | n/a | Closes |
| Memories | "Back to the map" | Previous page | n/a |

## Photo flow (`memories/MemoryCapture.tsx`, `ArrivalSelfie.tsx`)

1. **You made it:** the plan name, one line, and Take a photo together (front camera) or Choose a photo.
2. **Your photo:** preview with Retake, an optional caption with Muse's Suggest, "Only the people from this hangout can see it.", and one Save button.
3. **Saved:** the photo, then Rate the hangout, See memories or Back to the map. No confetti.

Uploads, the crew album and the Muse caption call are unchanged.

## Verification

- **Checks:** typecheck and lint are clean, all 332 unit tests pass, and the production build passes.
- **Scripted user walk:** 320, 390, 768 and 1440 px, every row in "Return paths now", with no page errors. 3D was rendered with software WebGL (SwiftShader), not a GPU browser.
- **Full e2e, both builds on fresh in-memory data, run in parallel:**

  | Build | Failed | Passed |
  |---|---|---|
  | `feat/plan-card` (base) | 28 | 118 |
  | this branch | 23 | 131 |

  - **Fixed by this branch:** all 4 Find My People tests at both widths, sharing settings, and 2 Muse filter tests.
  - **Failed only here in the parallel run:** the tests share one in-memory store, so a plan added by one test changes another test's pin count, and Maya's sharing state carries over between tests. Re-run one at a time on fresh data, all of them pass, plus `navigation.spec`: 27 of 29 pass. The 2 left are #17 above, which also fails on the base.
- **Still failing on both builds (pre-existing):**
  - entry and feed "I'm free" links
  - persona shell tests
  - Intro visibility
  - the Maya invite accept
  - seat-count join and leave on phones
  - the Muse filter toggle
- **Not verified:**
  - The 3D view in a GPU browser after this change.
  - The arrival photo saved end to end from inside 3D: SwiftShader triggers the slow-device fallback (#10). The same photo component was tested from Plans → Add a photo.

## Integration with Codex's 3D overhaul

Pending. On Thu Nov 12 at about 00:15 PT, `feature/world-visual-overhaul` (`../out-here-world`) had no commits and 61 uncommitted files. It was still being edited at 23:30. It starts from the Muse integration line (0faf935), not from main. Several files overlap this branch: `World3D.tsx`, `memories/MemoryCapture.tsx`, `memories/MemoriesPage.tsx` and `tests/e2e/your-plans.spec.ts`. The merge waits for Codex to commit and confirm it's finished. Steps, once it does:

1. `git worktree add ../out-here-int -b integration/ui-world feature/world-visual-overhaul`
2. `git merge --no-ff feature/ui-cleanup` there. Resolve file by file:
   - Codex keeps world rendering, lighting and scale.
   - This branch keeps the dashboard, navigation and photo steps.
   - `World3D.tsx` and the memories files get merged by hand.
3. Run typecheck, lint, unit tests, the build and the e2e suite. Take 390 and 1440 screenshots in a GPU browser, then do the UX review of the combined app.
