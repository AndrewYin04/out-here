# Demo run sheet: 45 Minutes to Thrift

One page for stage and rehearsals. Story: Alex and Maya both have a free 45 minutes. Muse makes a boba plan, they walk there in 3D, Alex picks up a $20 jacket on the way, and the photo lands in Memories.

## Before you start (every rehearsal, and right before stage)

1. **Use the hosted preview, never localhost.** Take the newest `main` link Andrew posts on issue #4. Laptop wifi makes local runs 5 to 20 s slower.
2. **Reset the story.** On laptop A: avatar menu (top right) → **Reset demo** → presenter key → **Reset shared demo**. Every open tab reloads into the fresh story: plans and seats, free windows, invites, shared plans, listings and holds, watches, photos, ratings, messages and notifications. Ask Andrew for the key. Never post it in an issue or chat.
3. **Warm up Muse:** `npm run warm:demo -- --base <preview url> --clear` (needs the deployed presenter key in `.env.local`). Its first step is the exact stage ask below, so on stage Muse answers instantly from a real cached answer. Change the ask in one place and you must change it in `scripts/warm-demo.ts` too. Measured cold: 7 s.
4. **Open the two screens.**
   - Laptop A (projected): `<preview>/out-here?as=alex&view=map`
   - Laptop B or phone: `<preview>/out-here?as=maya&view=map`
   - Seller (a teammate, as Nina): `<preview>/out-here?as=nina&mode=explore&view=map`. Keep the jacket form ready: store icon → **Sell for pickup** → *Vintage track jacket*, $20, Clothing, a pickup spot, pin dropped right by Bobalicious Corner.
   - Alex's jacket watch: **after** the reset (reset clears watches people added), on laptop A: store icon → type *track jacket under $25* → save.
   - Load each page once and wait for the map, so the first request is warm.

## The run (5 minutes)

| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00 | A | Friends map. Point at Maya's avatar and her bubble. | "I've got 45 minutes before I head out…" |
| 0:20 | A | **I'm free** → type exactly: *I've got 45 minutes. Can I grab boba with someone nearby?* → **✨ Find plans** | |
| 0:40 | A | Muse's pick is the posted **Boba + sketching** at Bobalicious Corner (4 min walk, starts in about 10, $7). Tap **Why Muse picked this** and read it. Then **Go with Maya**. | "Muse found a boba hangout starting in 10 minutes, and Maya's down." (Not "didn't exist a minute ago": the seed makes this a posted plan.) |
| 1:10 | B | The invite arrives → **Accept**. | |
| 1:30 | A | **Up next** → **Let's go**. Give the 3D walk 3 to 5 s. | |
| 1:40 | Seller | While both avatars walk: post the prefilled jacket. | |
| 1:50 | A | Within seconds a **✨ Muse** card appears on Alex's screen: "That $20 vintage track jacket was just listed. It's an N-minute walk…" → **View** → **Reserve for pickup** → arrival time → **Send request**. (Seen live in the rehearsal: the card pops up during the 3D walk.) | "I asked Muse to watch for a track jacket under $25." |
| 2:30 | Seller | Open the jacket → **Accept**. | |
| 2:40 | A | Pause on **Held for you · N min left**. | |
| 3:10 | A | Arrival → group selfie → save. | |
| 3:50 | A | **Memories** → the new photo and caption → point at **Get this group together again**. | |
| 4:30 | A | Close. | "Out Here starts with who's free and what's happening nearby…" |

## If something goes wrong on stage

- **Muse is slow:** with #76 merged, a live call over 4 s falls back to the cached real answer. Without it, keep talking through the "Muse is working" steps.
- **3D stalls:** tap the map button and continue on the 2D map. Up next, the hold and the photo all work there.
- **The pickup beat fails:** skip it and go straight to the photo.
- **Anything is out of sync:** Reset demo, reload both screens, and restart the scene.

## Cut from the story

- **Maya's "denim purse like the Reel you saved":** Reel-based picks (#62) live on the Marketplace page, not on the map. Run the single jacket listing (the script's own fallback).
- **"Campus Thrift Pop-Up" with several items:** not built. One listing is enough.

## Rehearsal notes (Fri 4–5 AM, localhost + dev database)

- Worked end to end with real Muse: the ask, Muse's pick and reason, Go with Maya, Maya's invite and Accept, Up next, Let's go, the 3D walk, the Muse jacket card during the walk, Memories, Get this group together again (4 s).
- Not verified yet: Reserve → seller Accept → "Held for you" live on Alex's screen, and how fast the invite reaches Maya (it took about 50 s on laptop wifi). **Check both on the preview first.**
- Rehearse on the preview and the demo database only. The shared dev database was reset by someone else mid-run, and laptop wifi stalled requests for 20 to 40 s.
- Maya's seeded status says "on a long lunch break", not "free after class · down for boba". Change the seed or the line you say.

## What has to be on `main` for this to work (status Fri 5 AM)

| Piece | Where | Status |
|---|---|---|
| Muse plan, draft plan, invite, Up next, 3D walk, arrival photo | main | ✅ |
| Marketplace pickup on the map (deleted by the #75 merge) | `fix/restore-map-marketplace` (Alex) | ⏳ needs a PR |
| Reset also clears Marketplace, Memories, ratings, messages | `feat/reset-everything` (Alex) | ⏳ needs a PR |
| Muse answer cache and warm-up | #76 (Andrew), migration 0009 | ✅ merged; the stage ask is added to the warm-up in `feat/reset-everything` |
| Muse finds say "an N-minute walk" when walkable, not "a 1-minute drive" | `fix/restore-map-marketplace` (Alex) | ⏳ needs a PR |
| Story seed: Maya's status "free after class · down for boba" (optional: the jacket and Alex's watch are posted live) | seed (Andrew) | ⏳ |
| Demo database reseeded (`npm run seed:demo`) | Andrew's laptop, around 6 to 7 AM | ⏳ |
