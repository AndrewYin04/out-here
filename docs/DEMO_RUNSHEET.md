# Demo run sheet: 45 Minutes to Thrift

One page for stage and rehearsals. Story: Alex and Maya both have a free 45 minutes. Muse makes a boba plan, they walk there in 3D, Alex picks up a $20 jacket on the way, and the photo lands in Memories.

## Before you start (every rehearsal, and right before stage)

1. **Use the hosted preview, never localhost.** Take the newest `main` link Andrew posts on issue #4. Laptop wifi makes local runs 5 to 20 s slower.
2. **Reset the story.** On laptop A: avatar menu (top right) → **Reset demo** → presenter key → **Reset shared demo**. Every open tab reloads into the fresh story: plans and seats, free windows, invites, shared plans, listings and holds, watches, photos, ratings, messages and notifications. Ask Andrew for the key. Never post it in an issue or chat.
3. **Warm up Muse** (once #76 is merged): `npm run warm:demo -- --base <preview url> --clear`. The stage asks in `scripts/warm-demo.ts` must match the wording below exactly.
4. **Open the two screens.**
   - Laptop A (projected): `<preview>/out-here?as=alex&view=map`
   - Laptop B or phone: `<preview>/out-here?as=maya&view=map`
   - Seller, if someone else plays them: `<preview>/out-here?as=<seller handle>&mode=explore&view=map`
   - Load each page once and wait for the map, so the first request is warm.

## The run (5 minutes)

| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00 | A | Friends map. Point at Maya's avatar and her bubble. | "I've got 45 minutes before I head out…" |
| 0:20 | A | **I'm free** → type exactly: *I've got 45 minutes. Can I grab boba with someone nearby?* → **✨ Find plans** | |
| 0:40 | A | Read Muse's reason out loud. Then **Make this plan** (a Muse draft) or **Go with Maya** (a posted plan). | "That hangout didn't exist a minute ago." |
| 1:10 | B | The invite arrives → **Accept**. | |
| 1:30 | A | **Up next** → **Let's go**. Give the 3D walk 3 to 5 s. | |
| 1:50 | A | Marketplace (store icon) → the **✨ Muse found** card → **View** → **Reserve for pickup** → arrival time → **Send request**. | "I asked Muse to watch for a track jacket under $25." |
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

## What has to be on `main` for this to work (status Fri 4 AM)

| Piece | Where | Status |
|---|---|---|
| Muse plan, draft plan, invite, Up next, 3D walk, arrival photo | main | ✅ |
| Marketplace pickup on the map (deleted by the #75 merge) | `fix/restore-map-marketplace` (Alex) | ⏳ needs a PR |
| Reset also clears Marketplace, Memories, ratings, messages | `feat/reset-everything` (Alex) | ⏳ needs a PR |
| Muse answer cache and warm-up | #76 (Andrew), plus migration 0009 | ⏳ open |
| Story seed: Maya's bubble "free after class · down for boba", the $20 track jacket listed by a switchable persona, Alex's jacket watch | seed (Andrew) | ⏳ not started |
| Demo database reseeded (`npm run seed:demo`) | Andrew's laptop, around 6 to 7 AM | ⏳ |
