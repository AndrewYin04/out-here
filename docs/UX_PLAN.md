# UX plan: one next step, from "I'm free" to the photo

Written Thu Nov 12, about 8 PM PT, after walking the demo flow on `feat/3d-to-main` as Alex and Maya (desktop and 390 px). Branch: `feat/ux-journey`. It serves `docs/DEMO_FLOW.md` scenes 3, 4, 7, 8 and 9.

## What a judge would hit today

| # | Problem | Seen |
|---|---|---|
| 1 | First screen is slow and blank | About 11 s of grey with floating pins on desktop; still blank after 10 s at 390 px. The companion model is 32 MB (about 25 MB of it geometry). |
| 2 | Dead ends after "yes" | Maya's accepted invite says "You're in with Alex." and stops. Alex's card offers a greyed "You're going" and a "Show on map" that frames nothing. A joined plan's panel offers only Leave. "Walk there" exists only in 3D with the plan selected. |
| 3 | Screens contradict each other | After the plan is set: "You and Maya are both free → See plans", and Muse says "Tap I'm free". |
| 4 | Too many controls | 11 on desktop, about 13 at 390 px, overlapping: Tour Meta HQ, Demo walk / Live GPS, Muse filter, two walk bars. |
| 5 | The selfie waits for the start time | Arriving early shows "the camera opens here when it starts, in 15 min", which stalls the demo. |
| 6 | Two photo prompts | Up next (feat/up-next) and the arrival selfie (feat/arrival-selfie) both open on arrival. |
| 7 | Your plan looks like any other pin | The plan you joined shows "Full", the same as a stranger's. |

## The rule

**Every screen shows exactly one next step for where you are in the journey:**

idle → I'm free → choosing → invite sent → **it's a plan → Let's go** → walking → arrived → **photo** → rate → memories

The Up next card (Ally, feat/up-next) is that next-step bar. Every confirmation leads into it.

## Changes on this branch (all built; walked through as Alex and Maya in two tabs)

1. **Merge feat/up-next** (Up next card, demo reset #15) as the base.
2. **One "Let's go" everywhere.** A shared `outhere:lets-go` event: the map switches to 3D and walks there.
   - Alex's "Maya's in" card: **Let's go** (primary) and Show on map.
   - Maya's accepted invite: **Let's go** (it opens Out Here and starts the walk, from any page).
   - Joining alone ("You're going"): **Let's go**.
   - A joined plan's panel: **Walk there** (primary), Leave as a small link.
   - The shared-plan card (TogetherSheet): **Let's go**.
3. **No stale lines.** Muse's greeting knows your plan ("Dumplings starts in 16 min. Tap Let's go and we'll walk there.") instead of "Tap I'm free".
4. **Selfie on arrival, even early** (up to 30 min before the start). The server lets attendees complete up to 30 min early and only marks the plan done once it has started, so a partner still walking keeps the pin.
5. **One photo prompt.** Arrival opens the selfie dialog; the Up next card's "Take a photo together" reopens that dialog instead of a second inline form.
6. **One walk bar.** While walking: "🚶 4 min to 🥟 Dumplings · with Maya · Stop". The plan panel closes when the walk starts, so the 3D view is clear.
7. **Fewer controls on stage.** Tour Meta HQ, Demo walk / Live GPS and the Muse filter show only with `?tools=1` (and in tests). The joystick stays (scene 8).
8. **3D loads without the blank.** A "Getting the street view ready…" veil until the map first settles, and the model is prefetched when the app opens.
9. **Your plan stands out on the map:** a blue ring and "You're going" on its label.

## Not on this branch (owners in DEMO_FLOW.md)

- Compress the companion model: re-export from Blender with Draco on (Ally). The loader then needs `DRACOLoader`; about 32 MB should drop to a few MB.
- "Someone into thrifting" must find Jordan: event-anchored intro (#44) and the thrift story seed (`wt/thrift-story`).
- The Muse conversation panel in 3D (#45).
- A real Muse key on both demo laptops: "Offline suggestions" on stage costs the AI score.

## Demo process

- Scope freeze about 2 AM PT: after that, only fixes for something that stumbled in a rehearsal.
- Every rehearsal starts from **Reset demo** (avatar menu, #15).
- Fri: 07:00 reseed · 07:30–09:30 three timed full runs · 09:45 reset and warm both laptops (open Out Here in 3D once) · 10:15 submit · 10:45 demo.
- Laptop check: "✨ Muse" (not "Offline"), 3D already loaded, `?as=` set per laptop, notifications muted, zoom 100%, power, hotspot.
- Backup: a screen recording of the full flow, made after the 8 AM run.
