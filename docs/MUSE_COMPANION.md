# Muse companion and chat (Phase 2)

One Muse for the whole Out Here experience. In the 3D world, tapping Jolly brings it to the front with the Phase 1 trail and opens a compact chat. Muse answers through the real planner with real plan cards you can act on. **View on map** opens that quest, and closing the chat sends Jolly back. The conversation survives navigation and reloads within the tab.

Branch `feature/muse-chat-controller`, cut from `feature/muse-energy-trail` (Phase 1). Not pushed, not merged.

## Files

| File | What |
|---|---|
| `src/features/muse-companion/state.ts` (new) | Pure state machine: `MuseState`, `MuseEvent`, `reduce`, `petPose` |
| `src/features/muse-companion/controller.ts` (new) | The single store: state, timers, conversation, requests (abort and stale guard), session persistence |
| `src/features/muse-companion/ask.ts` (new) | Turns a chat turn into one planner ask (follow-ups carry the user's own previous ask) |
| `src/features/muse-companion/MuseChat.tsx` (new) | Launcher, chat panel, plan cards, chips, error and retry |
| `src/features/muse-companion/MuseOrb.tsx` (new) | The UI presence: an energy orb in the Phase 1 palette (listening ripple, thinking orbit, responding settle) |
| `src/features/muse-companion/index.ts`, `state.test.ts`, `ask.test.ts` (new) | Barrel and 14 tests |
| `src/app/(fb)/layout.tsx` | Mounts `<MuseChat />` once in the shell, so it never remounts between pages |
| `src/features/world/World3D.tsx` (Alan's area, small) | The pet's pose and clip follow the companion; the speech bubble hides while the chat is open; a "✨ Muse" tap target over Jolly's head opens the chat |
| `src/features/map/OutHereView.tsx` (small) | Listens for `muse:select-quest`: switches to Explore and opens the quest |
| `src/features/outhere/index.tsx` | Exports `requestPlan`, `errorText`, `PlanResponse`, `openPlanWith` (no behaviour change) |

## State controller

`reduce(snapshot, event)` is the only source of truth: `{ open, state, selectedQuestId, selectionSeq }`.

- **idle → approaching** on `CHAT_OPENED`, which is ignored when the chat is already open, so rapid taps never restart the approach. The approach ends by timer (`APPROACH_DONE`, 700 ms; 120 ms under reduced motion).
- **listening** when the input gets focus; **thinking** while a planner request runs; **responding** when it lands, settling to idle after 3.5 s; **error** on failure, with the message kept and Retry offered.
- **returning** on `CHAT_CLOSED`, then idle (`RETURN_DONE`, 900 ms). A reply that lands after the chat closed is stored in the history but doesn't reopen anything or change the pose.
- Future states are already in the type and reducer: `delivering`, `evaluating`, `sending`, `receiving`, `celebrating`. Later features enter them with `ACTION_STARTED` and leave with `ACTION_ENDED`. `QUEST_DROPPED`, `PHOTO_EVALUATION_STARTED` and `PHOTO_SCORED` map onto them. None can interrupt a request in flight.
- `petPose(snapshot)` → `{ front, clip }` is what the 3D layer reads. `front` uses the existing pet "front" position; the clips are `think` → `thinking`, `talk` → `talk_front`, and `hover` → `follow_back` (from `public/models/manifest.json`).

## Chat

- **Desktop:** a 380 px card anchored bottom right, so the map stays the focus.
- **Phone:** a sheet above the tab bar that follows the on-screen keyboard (`visualViewport`).
- **Launcher:** on desktop it is an "Ask Muse" pill above the map's bottom-right controls; on phones it is a 48 px orb under the map chips. It shows on `/out-here*` and `/memories`.
- **Opening** doesn't call Muse; it shows the greeting ("Hey Alex! Need help finding something to do?"). The greeting is rendered, never stored, so it can't duplicate.
- **One surface at a time:** opening the chat closes the "I'm free" composer, and opening the composer closes the chat.
- **Chips:**
  - *I'm free* opens the existing composer.
  - *Find something nearby*, *What should I do?* and *Invite a friend* each send a real ask.
  - There is no Side Quest chip until that feature ships.
- **Sending:** empty input is rejected, and only one request can be in flight (double taps and Enter mashing send once; verified in the browser). Closing the chat, a newer send or a persona switch aborts or ignores the old answer.
- **Answers:**
  - Muse's summary comes first, then up to 3 of the existing `SuggestionCard`s, so Join, Go with Maya, Edit invite and the live seat counts are the real flows. Each card with a quest gets **View on map**.
  - Picks are also passed to `setPlanSuggestions`, so the map shows "✨ Muse pick" on those pins.
- **Source labels** use the existing ones: ✨ Muse for live model text, "Offline suggestions" for mock, and "Quick match (Muse was busy)" for the code fallback.
- **History** is kept per persona in `sessionStorage` (last 40 messages). Escape closes the chat, and focus goes back to the launcher.

### Follow-ups

The planner takes one ask, so the chat does no free-form generation. A short follow-up (7 words or fewer, no time window of its own, not a new request like "I'm…" or "what…") is appended to the user's previous ask: "hungry, 40 min, under $15" then "something closer" becomes "hungry, 40 min, under $15, something closer". Only the user's own words are carried over. Anything else starts fresh.

## Phase 1 reuse

The chat starts no new trail. Jolly's move to the front and back is ordinary pet motion, and the Phase 1 `MuseTrail` (style `walk`) in `WorldLayer` draws the wake from that movement. In the browser the wake shows on the approach. The orb in the UI uses the same four colours.

## Demo

1. `npm run dev`, open `/out-here?as=alex&view=3d`.
2. Tap "✨ Muse" over Jolly, or the "Ask Muse" pill. Jolly flies forward with the trail, and the chat unfolds.
3. Type "hungry, 40 min, under $15" and send. The header orb orbits and Jolly plays `thinking`. Then the summary and the Dumplings card appear (9 min walk, $12, 2 left, Go with Maya).
4. Send "something closer": the 40-minute window is kept.
5. **View on map**: the chat closes, Jolly returns, and the map switches to Explore with the Dumplings sheet open and "Walk there".
6. Reopen the chat: the whole conversation is still there. Open `/memories`: same conversation, with the orb instead of a 3D Jolly.

## Verified

- typecheck, lint, 331 tests and `next build` pass.
- **Chrome (desktop, GPU, mock Muse, since no `.env.local` exists in any checkout):** tap Jolly → approach with the trail → thinking → plan cards; follow-up; View on map; reopen; triple submit = 1 request; forced 502 → error → Retry → answer; persistence into `/memories`.
- **Headless Chromium at 390 × 844 with reduced motion:** sheet above the tab bar; View on map closes the chat and opens the quest sheet; the orb doesn't overlap the sheet.

## Known limits

- **Not run against the live Muse API**: there is no key on this machine. The live path is the same `/api/muse/plan` call the composer already uses.
- **Jolly isn't picked in 3D:** the tap target is a label over its head, not a raycast hit on the model.
- **Where Jolly stops:** it uses the existing pet "front" spot in front of the avatar, not a spot beside the chat panel.
- **Thinking orb:** it is in the chat UI, not a 3D orb around Jolly in the world.
- **Follow-ups:** they are a rule, not model memory. A short new topic ("boba") is joined to the last ask.
- **Keyboard inset:** checked by reasoning and in desktop browsers only; not tested on a real phone keyboard.
- **Team process:** the task wasn't claimed on the team tracker. `WorldLayer.ts` and `World3D.tsx` are Alan's files with unmerged branches, so expect small merges.
