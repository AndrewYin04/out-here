# Out Here dashboard: one swipe-up panel (design for a separate branch)

Status: designed, not built. Build it on its own branch after the Nov 13 demo, starting from `feature/ui-cleanup`. The interaction pattern is inspired by Life360; the look stays Facebook.

## Why it is not built tonight

Demo scenes 4 to 9 (`docs/DEMO_FLOW.md`) run through these surfaces:

- the Muse panel on the 3D map (#45, Alan)
- the I'm free composer and the plan-together flow (#56, Alan)
- the walk (Alan)
- Muse's reasoning (#12, Andrew)

Codex is wiring Muse-to-Muse encounters into `World3D.tsx` and the companion controller.

A dashboard that absorbs those panels replaces exactly what the demo shows. Doing that the night before would put the demo at risk and collide with all four streams of work.

## What shipped instead (on `feature/ui-cleanup`, Out Here only)

- **The dock** (`src/features/map/OutHereDock.tsx`):
  - **Above the sheet:** "I'm free", one contextual action (Post in Explore, People in Friends) and a round Map/3D button.
  - **The sheet:** a handle and one row of pills: Explore, Friends, Your plans and Memories. The selected pill is wide and filled with its icon and label; the others are tinted and show only their icon, and each keeps its name for screen readers. The pills ease between widths, with no animation under reduced motion.
  - **The handle:** drag it, tap it, or press Enter or the arrow keys to open a list of the plans on the map, then fold it again.
  - **What it replaced:** the old bottom row and the Explore/Friends toggle at the top. With demo tools off, the top of the map is empty.
- **`useSheetDrag`** (`src/features/ui/useSheetDrag.ts`), used by the dock, the I'm free sheet and the quest sheet:
  - **Dragging:** up snaps to full height; down returns to half, or closes from half. A quick flick counts.
  - **Mouse, touch and keyboard:** a tap or Enter toggles; ArrowUp expands and ArrowDown collapses.
  - **Reduced motion:** the snap is instant.
- **Facebook's tab bar is unchanged.** The compact active-tab pattern lives in the dock's pills instead.

The dock is the peek state of the dashboard below. What is still missing is the half state hosting the contexts: composer, results, quest, Muse chat.

## The dashboard

One draggable panel at the bottom of the Out Here map replaces the separate sheets. It has three snap points:

| State | Height (390 × 844) | What it shows |
|---|---|---|
| **Peek** (default) | About 120 px above the tab bar | One line of context (your status, or "Maya is free till 6" when that is the most relevant), then the action row: Map/3D, I'm free, Your plans, + |
| **Half** | About 50% | The active context: the composer, the Muse results, a quest, the plan-together flow or the Muse chat. The map stays visible above it |
| **Full** | The screen minus 8 px | Everything in that context, scrollable: going lists, "Why not others?", "How Muse picked these" |

### Behaviour

- **One context at a time:** `idle | composer | results | quest | together | create | muse | people`.
  - Opening a context replaces the current one; it never stacks a second sheet.
  - The idle peek is the default, and the map is unobstructed.
- **What changes the context:**
  - Tapping a pin sets the context to quest and snaps to half.
  - "I'm free" sets composer at half. Results stay in the same panel.
  - Close (or a swipe down from half) returns to idle peek, not to nothing.
- **Gestures:**
  - Dragging anywhere on the peek, or on the handle at half and full, moves the panel. Scrolling content at full scrolls; at the top of the content, a pull down drags the panel.
  - Snap uses velocity and distance (the `useSheetDrag` thresholds), with a 240 ms ease-out.
- **Keyboard:** the handle is a button (Enter toggles half and full, the arrows step through the states), and focus moves into the context when it opens.
- **Desktop (≥ 768 px):** the same contexts render in a fixed left column (400 px, like the current panels), with no drag.

### Jolly and Muse

- **Jolly stays visible at peek.** The 3D camera's look-at point shifts up by the panel's height, so Jolly and the avatar are never under it.
- **Opening the Muse chat** sets the context to muse at half: the conversation renders inside the panel, replacing the floating chat card on `feature/muse-chat-controller`. The companion controller states (approaching, listening, thinking, responding, returning) are unchanged; only where the chat renders moves.
- **During a Muse-to-Muse encounter**, the panel drops to peek automatically and the panel shows one status line. The controller already emits the encounter state. The panel restores the previous context when the encounter ends.

### Where the existing code goes

The rows below are content moves; data flows, API calls and test ids stay.

| Today | In the dashboard |
|---|---|
| `outhere/PlanSheet.tsx` `<section>` wrapper | The `composer` and `results` contexts (the inner content moves as is) |
| `map/QuestPanel.tsx` | The `quest` context |
| `outhere/TogetherSheet.tsx` | The `together` context |
| `map/create/CreatePlanSheet.tsx` | The `create` context |
| `map/friends` People sheet | The `people` context (Friends mode) |
| The bottom action row in `OutHereView.tsx` | The peek's action row |
| `BothFreeNudge` docked card | The peek's context line ("Maya is free too · See plans"), not a separate floating card |
| `muse-companion/MuseChat.tsx` panel | The `muse` context (the launcher orb stays on the map) |

Implementation: one `OutHereDashboard` component holds the snap and context state in a small external store, the same way `plan-state.ts` does. The existing sheets lose their own `absolute bottom-0` wrappers and render as children of the dashboard.

### Performance and motion

- The drag only changes `transform`: no layout per frame, and pointer capture on the handle. Content height snaps through `max-height` with one transition.
- Reduced motion: snaps jump with no transition, and the tab pill does not animate.
- No new dependency (no gesture library).

### Risks to check when it is built

- The e2e tests that open the sheets by test id: keep the ids on the moved content.
- The 3D camera offset must not move the avatar under the top chips.
- The desktop layout is unchanged in structure, so test it at 1440 px.
- Messenger notifications and invites (`InviteInbox`) stay where they are: they are not Out Here contexts.

### Order of work (about one day)

1. Build the dashboard shell with peek, half and full on `useSheetDrag`, and the idle peek with the action row.
2. Move quest, composer and results in, then together and create.
3. Move the BothFreeNudge line into the peek.
4. Merge in the Muse chat context once `feature/muse-chat-controller` and Codex's encounter work are on main.
5. Shift the 3D camera, add the encounter auto-peek, and run e2e plus the 390 and 1440 screenshots.
