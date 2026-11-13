# Demo guide: Out Here, 45 Minutes to Thrift (3:00)

The 5-minute slot is 1:00 of intro, this 3:00 demo, and a 1:00 close and buffer. Follow it exactly: the prompts below are the words the rehearsal typed, and the Muse cache is warmed with them.

## Setup

### Who drives what

**Production:** https://out-here-three.vercel.app (demo database, live Muse; main 0fc43a0, promoted 8:27 AM PT Fri).

**Opening hours are real on production.** Bobalicious Corner opens at 10:00 AM, so before 10:00 Muse answers "no place fits" on production. Rehearse before 10:00 on a preview (previews ignore opening hours); at 11:15 production works.

| Screen | Persona | URL (production, or the verified preview) | Size |
|---|---|---|---|
| Laptop A, projected | Alex (demo driver) | `/out-here?as=alex` | 1440 x 900 |
| Phone (or a narrow window beside A) | Maya | `/out-here?as=maya` | 390 x 844 |
| Laptop B, teammate | Leo (seller) | `/out-here?as=leo&sell=popup` | 1440 |

Each tab keeps its own persona (`?as=` is stored per tab), so all three can be tabs in one Chrome profile. Leo's URL opens the "Campus Thrift Pop-Up" sheet with the $20 track jacket and the Y2K denim shoulder bag already filled in. Leave it open and do not tap it until beat 3.

### Before going on stage (10:00 to 10:20 AM PT)

1. The main session reseeds `out-here-demo` (`npm run seed:demo`) at about 6 AM PT, after applying any migration on main.
2. On Alex's tab: avatar menu (top right) → **Reset demo** → type the presenter key → **Reset shared demo**. This sets every time relative to now: Maya is free for the next 90 minutes, the boba quest moves to the afternoon, every listing hold and every rehearsal photo is cleared.
3. Warm Muse's cache from Andrew's laptop: `npm run warm:demo -- --base https://<production or preview URL>`. Its first step is the exact stage ask below, then it resets again.
4. Open the three tabs above and reload each once after the reset. Check on Alex's map that Maya's avatar has a green ring and that Up next shows nothing.
5. Close every other tab. Turn off notifications on the presenting laptop.
6. **Grant camera access** for the site in Chrome on the laptop that takes the beat 4 photo (address bar → site settings → Camera → Allow). Otherwise the permission prompt shows on the projector and, after 3.5 s, the app shoots a sample image instead of you two.

What must be on screen at 0:00: Alex's Out Here map (Friends tab), Maya's phone on her Out Here map, Leo's laptop on the open pop-up sheet.

## The script

### Beat 1. Two friends have 45 minutes (0:00 to 0:25)

| | |
|---|---|
| Screen | Alex (projected) |
| Click | Hover Maya's avatar on the map: her bubble shows. Then tap **I'm free** (the blue button above the dashboard). |
| Type | **"I've got 45 minutes. Can I grab boba with someone nearby?"** then press Enter |
| Say | "Alex has 45 minutes between things. Maya's status says she's free after class and down for boba. Alex just tells Muse what he wants." |
| Audience sees | Maya's bubble "🧋 Free after class · Down for boba · updated N min ago", then Muse's steps: reading the ask, checking who's free, checking plans nearby. |

### Beat 2. Muse makes the plan (0:25 to 1:10)

| | |
|---|---|
| Screen | Alex, then Maya, then both |
| Click | Alex: **Make this plan**. Maya (phone): **Accept** on the invite card, then **Let's go**. Alex: **Let's go**. |
| Type | nothing |
| Say | "Nothing posted fits, so Muse drafts one: Maya is free, they both like boba, Bobalicious Corner is a 4-minute walk. One tap sends it. Maya says yes on her phone, and both of them are on their way." |
| Audience sees | "✨ Muse drafted a plan for you and Maya": a title like "Boba run", Bobalicious Corner, 4 min · Maya 8, about $7, and Muse's why ("You both like boba, Maya is down for boba, and it's only a 4 min walk for you"). After Make this plan: "Plan made · Maya's invited". Maya's phone gets the invite within about 2 s. After Let's go the 3D street view opens with both avatars walking. Keep the walk to about 5 s. |

### Beat 3. The thrift pop-up goes live (1:10 to 2:15)

| | |
|---|---|
| Screen | Leo, then Alex and Maya, then Leo, then Alex |
| Click | Leo: **Open the pop-up**. Alex: **View** on the Muse card → **Reserve for pickup** → **Send request**. Leo: **Accept** (in the jacket's sheet, which stays open after Open the pop-up, or on the request card at the top of the map). |
| Type | nothing |
| Say | "While they walk, a student opens a thrift pop-up on campus. Muse knows Alex set a watch for a track jacket under $25, and Maya saved a denim styling Reel. Same public sale, a different reason for each of them. Alex reserves the jacket, the seller accepts, and it's held for him." |
| Audience sees | The pop-up's pin appears on every map within a few seconds (the Muse cards take 4 to 6 s: Muse writes each line live). Alex: a Muse card about the $20 track jacket matching his watch. Maya: a Muse card about the Y2K denim bag, citing the denim Reel she saved. Alex's sheet: "Requested", then "Held for you · N min left" with the countdown. |

### Beat 4. Fit check into Memories (2:15 to 2:45)

| | |
|---|---|
| Screen | Alex, then Maya |
| Click | Alex: close the jacket's sheet (X), tap **Let's go** on Up next (the walk resumes in 3D and arrives in about 10 s). "You made it" opens full screen: tap **Take the photo**, then the round shutter (the camera also counts 3-2-1 by itself). The print saves to the album at once ("Saved to your memories"); Muse's caption appears on it a few seconds later ("Muse is looking at your photo…" first, about 7 s). Tap **Done**. Then Menu → **Memories** on both screens (on Alex's laptop, scroll once to show **Get this group together again**; it answers in about 4 s). |
| Type | nothing |
| Say | "They made it. One fit check, the jacket and the drinks, saved to their shared album. Muse writes the caption, and offers to get the group together again." |
| Audience sees | The photo in the shared album on both screens, the ✨ Muse caption on it, and "Get this group together again". |

### Close (2:45 to 3:00)

Say: "Forty-five minutes, one sentence to Muse, a friend, a find, and a memory. That's Out Here."

## Fallbacks

- **Muse is slow (no draft card after about 8 s):** keep talking over the "Muse is working" steps; the warmed cache normally answers in under 2 s. If nothing after 20 s, tap **Change** and send the same text again.
- **Maya's card names the wrong item or none:** her history is now only the denim shoulder-bag Reel, so live Muse should pick the bag. If it does not, open Explore on Maya's phone, tap the $15 pin and say the reason yourself ("like the bag in the Reel she saved").
- **No Muse card about the jacket or the bag (beat 3):** the team's fallback. On Alex, switch the dashboard to Explore, tap the jacket's pin, and run **Reserve for pickup** on it as a single listing. Say Muse's reason yourself.
- **The walking view stalls or renders blank:** tap the **3D** button to return to the map and continue there; the plan, the pop-up and the photo all work on the flat map.
- **The photo prompt does not open on arrival:** tap **Take a photo together** on Up next, or open the plan's pin and tap **Add a moment**.
- **No caption on the print:** the photo is still in the album; say the caption yourself and move on.
- **Maya's denim-bag card does not appear within about 20 s:** on Maya's phone tap Explore, tap the $15 pin, and say "Muse matched it to the Reel she saved."
- **Walk there** (Your plans) now starts the same in-app 3D walk as **Let's go**; it no longer opens Google Maps.
- **The find card covers the walk:** tapping **View** on a Muse card leaves the 3D walk for the map. That is expected; beat 4 starts with **Let's go** on Up next, which resumes the walk.
- **Leo's tab shows no request after Alex sends it:** Leo taps the $20 pin (Explore) to open its sheet; the request is there with Accept.
- **Invite does not arrive on Maya's phone within 3 s:** pull down or reload Maya's tab; the invite is in Out Here and in Notifications.
- **Anything is left over from a rehearsal:** Reset demo (Setup step 2) and reload all three tabs.

## Reset between runs

Every run creates a plan ("Make this plan"), two listings ("Open the pop-up"), a hold, a photo and a crew. Reset before each run, every time:

1. Alex's tab: avatar menu → **Reset demo** → presenter key → **Reset shared demo**. This removes every plan, listing, hold, photo, crew and notification made since the seed, and restarts the story's clock from now.
2. Reload all three tabs (Leo's again with `?as=leo&sell=popup`).
3. If the reset key is not at hand: `npm run seed:demo` from Andrew's laptop (demo), or `npm run seed` (dev), then reload.

Alex can post only 5 plans a day (`EVENTS_PER_DAY` in `src/features/data/core.ts`). Each run's "Make this plan" counts as one, so without a reset the sixth run fails with "You can post 5 plans a day". A reset or a reseed clears them.

## Measured in rehearsal

11 rounds on dev previews with real Muse, three headless Chromium screens on one laptop. Round 11 (preview of `80b95c8`: main 6b17c33 plus this branch) is the best full pass. Everything that ran on the server was fast; the slow numbers came from this laptop: three headless 3D maps on a CPU that other agents' test runs held at 100 %, plus Wi-Fi drops. Curl from the same laptop got the same routes in 0.3 to 5 s.

| Step | Round 11 on screen | Server time (curl, warm) | Stage target |
|---|---|---|---|
| Maya's bubble on hover | 6 s after load (load itself slow) | friend pins under 2 s | instant |
| Muse plan + draft card | 49.9 s (one retry fired) | plan 1.4 to 4.7 s, draft 0.8 to 3.2 s | 5 to 8 s, about 2 s from the warmed cache |
| Make this plan | 6.5 s | | 1 to 2 s |
| Invite on Maya's phone | 2.9 s | | about 2 s |
| Maya accepts | 3.6 s | | |
| "Maya's in" on Alex | 3.9 s | | about 2 s |
| Let's go → 3D on both, Maya's avatar walking on Alex's screen | 0.1 s | | |
| Open the pop-up (2 listings) | 11.0 s | | 2 to 4 s |
| Alex's Muse card ("Fits the watch you set: track jacket under $25") | 19.1 s after the pop-up | finds 3.8 s | 4 to 6 s |
| Maya's Muse card | 21.0 s after the pop-up, but it named the jacket; fixed after round 11 (see Fallbacks) | picks 2.5 to 5 s | 4 to 6 s |
| Reserve → request on Leo's screen | 0.3 s (round 9) | | about 1 s |
| Leo accepts → "Held for you · N min left" on Alex | 11.5 s (round 9) | | about 2 s |
| Walk resumes, arrival opens the photo prompt | 25.8 s (round 9) | | about 10 s |
| Save to crew album | 8.6 s (round 9) | | 2 to 4 s |
| Muse caption | 8.5 s (round 9): "Navy track jacket with white stripes, ready to wear" | | 3 to 6 s |

What was never measured end to end: Maya's photo in the album and "Get this group together again" on Memories (the run hit the 5-minute kill first), and Maya's bag find after the last seed fix (unit-tested with the mock, not yet seen on live Muse). Run the whole script once on the production URL after the 6 AM reseed and the warm-up, and check those three things by hand.
