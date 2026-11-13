# Demo flow: the closet sale

The demo is Fri Nov 13, 10:30 AM PT: 5 minutes on stage, then 3 minutes of Q&A. This file is the plan for those 5 minutes. Any task that does not move one of the 11 scenes below waits until after the demo.

Status was checked against `origin/main` on Thu Nov 12 (after PRs #10, #39, #42 and #43 merged). Muse Intros and Messenger are on `overnight` and reach main with #17. Update a scene's status line when your work changes it.

## The story

Alex likes thrifting and vintage. Scrolling Facebook, he sees a recent grad's closet clean-out on Marketplace, and she has turned it into a closet sale today where people can try things on. Alex tells Muse he is free and wants someone to go with. Muse vets people and introduces Jordan, a stranger who also thrifts and collects band tees; the trust path is "you both know Maya". The map shows only the general area of the sale until you are confirmed, like a normal Marketplace pickup; once Alex and Jordan are on the plan, Muse messages them the exact spot. Both say yes. They walk there together on the 3D map, take a selfie, and each rates the hangout in private, so Muse matches better next time. Every scene below serves this one story.

Two laptops drive it: Alex on laptop A and Jordan on laptop B. A phone shows that it also works on mobile.

## Decisions

- **Person 1** is Alex, on laptop A.
- **Person 2** is Jordan, on laptop B. Jordan and Alex are strangers. The trust path is "you both know Maya": Jordan is already Maya's roommate in the seed.
- **The seller** is Leah Moreno (handle `leah`), a new fictional persona: a recent grad clearing out her closet before she moves to Seattle. Leah is not a friend of Alex or Jordan. (The handle `priya` was already taken in the seed.)
- **The closet sale** is "🧥 Closet sale + try-ons", hosted by Leah in the courtyard of Willow Court Apartments, a fictional apartment complex in Belle Haven about 580 m from Alex in a straight line. It starts 30 minutes after the reseed, lasts 2 hours, is free, and has 8 spots with 3 taken, so 5 are open.
- **Location rule (Andrew):** the map, the plan page, the plan sheet, the listing page and the intro card show only the general area, "Belle Haven, near Ivy Dr", with the pin fuzzed about 200 m, until the viewer is confirmed. Joining the plan, or Leah accepting a hold on the listing, confirms you. Muse then posts a ✨ Muse note in your Messenger chat with Leah: "You're confirmed for Leah's closet sale + try-ons at <start time>. Exact spot: Courtyard by the bike racks, Willow Court Apartments. Text Leah when you're here." The pin switches to the exact spot and the sheet shows "Exact spot unlocked".
- **Walks:** Alex's sheet, intro card, Go button and Muse's notes all read "10 min walk" before and after he joins: a plan with a named area measures the walk to the area, so the number never changes and never hints at the exact spot. Jordan is 6 minutes away from his "I'm free" spot. The intro card, the plan sheet and Muse's notes use one walk rule (`walkToPlanMinutes`), so the numbers agree on every screen.
- **Start time:** every screen names the clock time from the plan's `startsAt` to the minute (`formatDemoTime`): the plan page, the intro card ("Today 10:47 AM") and Muse's notes. No screen stores a "Starts in N min" string.
- **Scene 2** is done live if Rishab's listing-to-plan link (#48) lands by Fri 6 AM PT. Otherwise the closet sale is pre-seeded and scene 2 takes about 10 seconds: show the listing, then the plan it names.
- **The selfie** uses the laptop camera, with a prepared photo file as the backup.
- **The demo database** (`out-here-demo`) is reseeded around Fri 6 to 7 AM PT, so dry runs use the real times, and again about 10 minutes before going on stage, so the closet sale still starts about 20 minutes after the demo begins.
- **The production URL** will be getouthere.vercel.app.

## What the seed holds for this story

Built on `wt/thrift-story` (`src/shared/seed/thrift.ts`, `src/shared/seed/story.ts`, `src/shared/seed/intros.ts`, `supabase/seed-content.json`, `supabase/seed-places.json`). Every name, venue and item is invented; there are no brand names.

- **Leah's listing** (`l31`): "Closet clean-out: vintage denim jackets, band tees, sneakers, $5–25 each", from $5, with a drawn picture of a clothing rack. It is a Marketplace pickup (PR #58): `pickup_until` is 2 hours after the reseed, `pickup_label` is "Belle Haven, near Ivy Dr" and `pickup_spot` is the courtyard. Its description ends "The map shows the area; Muse shares the exact spot once you join the sale on Out Here or I accept your hold."
- **Leah's Feed post** (`p301`): a public post in Menlo Park New Grads, a Group Alex is in, posted 24 minutes before the reseed, so it is near the top of Alex's Feed: "Closet sale today, come try stuff on 🧥 …". It has no relative times ("in half an hour") that go stale. Bea and June have commented. Alex and Jordan never appear as seeded reactors on the story's posts, so Alex's Like on stage is his own.
- **The plan** (quest key `closet-sale`): hosted by Leah, with June and Sage already in. Its tags include thrifting, vintage, closet sale, try-on, denim and band tees, plus `listing:<listing id>` (PR #58 has no plan link, so the tag stays). The plan's sheet shows "Hosted by Leah Moreno" and a row for the listing, and the listing page shows the plan with its general area.
- **Alex and Jordan** both list thrifting, vintage and band tees; Jordan keeps local bands, indie music and vinyl. Their friendship intro settings ask for friends for local shows, thrift runs and closet sales. A friendship intro round for Alex picks Jordan at 97 with 3 reasons, each quoting a different sentence of Jordan's thrift-walk post (`p302`): band tees, vintage and thrifting. The trust path is "You both know Maya" and the suggested first step is the closet sale.
- **Who is free for the sale:** Jordan ("around Belle Haven for the next hour or so, down to browse a sale"), Bea ("day off, hunting for vintage", trust path via Tyler) and Grace ("free before volleyball", in Menlo Park New Grads with Alex) each have a seeded "I'm free" window over the sale. "Find someone to go with ✨" on the plan, with "someone into thrifting to go with", returns 3 choices that all clear the 85 bar: Jordan 97, Bea 91, Grace 91.
- **Jordan's history:** one past hangout, a thrift walk at Willow Thrift Co. 9 days ago with Bea, with a crew and one photo.

## Status key

- **Built**: merged to main, or in review.
- **Partly built**: some of the scene works on main, or the rest is on a teammate branch that has not been checked together with main.
- **Missing**: nothing on main does this scene yet.

## Act 1: Discover (0:00 to 0:40, proposed)

### Scene 1. Scrolling Facebook, a closet sale catches his eye

- **Screen:** laptop A.
- **The judge sees:** Alex scrolls the Feed and sees Leah's post: a closet sale with vintage denim and band tees.
- **Status:** built in the seed (`wt/thrift-story`).
- **Exists:** Feed, the Marketplace grid and item pages (`/marketplace`, `/marketplace/<id>`), 31 seeded listings. Leah's Feed post shows a Marketplace share card ($5, title, "View listing") that opens the item page.
- **Needs:** nothing.
- **Owner:** Andrew's agent (seed).

### Scene 2. The seller makes it a closet sale

- **Screen:** Leah (either laptop, or pre-made in the seed).
- **The judge sees:** Leah's listing has a closet sale plan, live on the map as a general area.
- **✨ Muse:** fills in the title, time and invite copy from one sentence.
- **Status:** built in the seed; live creation is partly built.
- **Exists on main (PR #43, PR #58):** "＋ Post a plan" from the map with the Muse one-line draft, plan visibility, check-ins and the plan page `/out-here/plan/<id>`. Marketplace pickups (PR #58): pickup windows, holds, and the exact spot only for a buyer whose hold the seller accepted.
- **Exists in the seed (`wt/thrift-story`):** the item page shows "Closet sale + try-ons" at "Belle Haven, near Ivy Dr" with a link to the plan, and the plan's map sheet shows the listing row and "Hosted by Leah Moreno". They are linked by the quest tag `listing:<listingId>`.
- **Needs:** starting the plan from the listing live.
- **Owner:** Rishab.

## Act 2: Muse brokers the match (0:40 to 2:40, proposed; the AI core)

### Scene 3. Opens Out Here: 3D map first, friends' bubbles around him

- **Screen:** laptop A.
- **The judge sees:** the first screen is the 3D street view with his avatar and the Muse companion. Friends nearby stand as avatars with their status ("🥟 Maya · craving dumplings").
- **Status:** partly built.
- **Exists on main (PR #43):** the 3D street view with a third-person camera, Ally's Jolly companion, nearby friends as avatars with their status label, and one continuous zoom from 3D out to the flat map. Find My bubbles on the 2D map. `?view=3d` opens the 3D view.
- **Needs:** 3D as the landing view. Today the view is the last one used, so a first visit lands on the 2D map. The Jolly model is 30.7 MB and needs a web export before phone use.
- **Owners:** Alan (3D view), Ally (models).

### Scene 4. "I'm free." Muse comes over to talk

- **Screen:** laptop A.
- **The judge sees:** he says he is free and bored. The Muse companion moves in front of his avatar and asks what he is in the mood for.
- **✨ Muse:** reads his words into time, budget and walk limit, and shows what it checked.
- **Status:** partly built.
- **Exists on main:** the I'm free composer with "For how long?" and "Up for" pickers (PR #42); Muse plan with its loading steps and "Why Muse picked this"; Free/Busy status and the Muse pre-check (PR #39); the Muse companion in 3D, which speaks the plan status in a bubble (PR #43).
- **Needs:** the conversation itself inside a Muse panel on the 3D map: Muse's question, his answer, and the choices.
- **Owners:** Alan (panel and animation), Ally (Muse model), Alex (what Muse says).

### Scene 5. "The closet sale, but with someone into thrifting too"

- **Screen:** laptop A.
- **The judge sees:** on the plan, Alex taps "Find someone to go with ✨" and types "someone into thrifting to go with". Muse vets the people in his reach who are free and within a 25 min walk, and offers 3 choices, each with the trust path, a one-line why from real posts, and "Go with them".
- **✨ Muse:** agents vet each other, and every reason comes from real data. Nobody hears anything until Alex picks one.
- **Status:** built on `wt/thrift-story` (mock mode on a fresh seed).
- **Exists:** plan-anchored intros (`wt/event-intro`), the choices list, and "Go with them". Choices are marked on the server (`FirstStep.choice`): they stay out of the inbox, come back after a reload, and asking again replaces them, one per person. Picking one removes the others and asks only that person. The intro's first step is the closet sale, never the band pregame.
- **Needs:** the choices shown in the 3D Muse panel.
- **Owners:** Alex (matching), Andrew's agent (intros), Alan (panel).

### Scene 6. Jordan gets the ping and says yes

- **Screen:** laptop B.
- **The judge sees:** a notification arrives on laptop B. Muse gives Jordan a rundown of Alex and why they would get along. Jordan says yes.
- **✨ Muse:** double opt-in. Nothing is shared until both say yes.
- **Status:** partly built.
- **Exists on `overnight` (main gets it with #17):** the intro notification, the intro card and Accept, live on both screens in about 2 seconds. Jordan's card says "Saying yes adds you to 🧥 Closet sale + try-ons · Today <time> · <N> min walk".
- **Needs:** the rundown and the Yes button in Jordan's Muse panel on the 3D map.
- **Owners:** Alex (what Muse says), Alan (panel).

### Scene 7. "It's happening. Head there now."

- **Screen:** both laptops.
- **The judge sees:** after both say yes, both are on the plan. Each connected card shows "✨ Muse · 📍 It's on. Exact spot: Courtyard by the bike racks, Willow Court Apartments. 10 min walk for you, today <time>." and a "Go · 10 min walk" button. Muse posts the same spot in their shared chat and in each one's chat with Leah. Go opens `/out-here?go=<questId>`, which starts the walk through Up next's Let's go (the World3D `walkTo` hook).
- **Status:** built on `wt/thrift-story`.
- **Needs:** the "head there now" moment inside the Muse panel on the 3D map.
- **Owners:** Alan (panel), Alex (copy).

## Act 3: Meet (2:40 to 3:40, proposed)

### Scene 8. Walk there together on the 3D map

- **Screen:** both laptops.
- **The judge sees:** each person steers with a joystick. Each sees the other's avatar moving toward the closet sale, and the walk minutes count down.
- **Status:** partly built.
- **Exists on main (PR #43):** the demo walk with a joystick, arrow keys and "Walk there", the walking countdown, and plan beacons. Friends stand as avatars at their shared Find My location.
- **Needs:** the walking position sent to the other laptop. Today the demo walk never writes a position to the server, so Jordan does not see Alex move. It should reuse the `location:<userId>` Broadcast (ids only, then refetch). Real GPS (#40) stays off on stage.
- **Owner:** Alan.

### Scene 9. They arrive and take a selfie

- **Screen:** both laptops.
- **The judge sees:** on arrival the selfie prompt opens. The photo saves to their private memory, with an option to post it with a Muse caption.
- **✨ Muse:** writes the caption.
- **Status:** partly built.
- **Exists on main:** Your Plans and the shared crew album with photo upload and a Muse caption (PR #10, #21). In 3D, walking within the arrival radius of a plan shows "📍 You're at <plan>" for 5 seconds (PR #43).
- **Needs:** arrival opens the photo capture instead of only the toast; an optional post to the Feed.
- **Owners:** Alan (arrival), Alex (photo capture).

## Act 4: Remember (3:40 to 4:40, proposed, then a 20-second close)

### Scene 10. Rate the hangout, Beli-style, in private

- **Screen:** laptop A.
- **The judge sees:** Loved it / fine / not for me, then "which was better?" against past hangouts, highlights, the selfie attached, and "hang out with them again?", which only Muse sees.
- **✨ Muse:** this private signal is what Muse used in scene 5, so the loop closes.
- **Status:** built, in review.
- **Exists:** the full questionnaire, routes and seed (#18, PR to main).
- **Needs:** it opens right after the selfie, with the selfie attached.
- **Owner:** Andrew's agent.

### Scene 11. The photo lands on the memory board

- **Screen:** laptop A.
- **The judge sees:** the memory board shows the new selfie next to past hangouts. The close is Muse asking, "Want to do this again next Saturday?"
- **Status:** partly built.
- **Exists:** crew albums and regroup on main; the memory board on `feature/memories-journey-ui` (Ally, #19), using the recap route.
- **Needs:** the new photo appears live, and the regroup line as the close.
- **Owners:** Ally (memory board), Andrew's agent (regroup).

## What the demo still needs, in order of risk

1. **The thrift story in the seed.** Built on `wt/thrift-story`: Leah, her pickup listing and post, the closet sale plan with its general area and exact spot, Alex and Jordan as thrifters, Bea and Grace as the other choices, and Jordan's past thrift walk. It reaches the demo with a reseed. Owner: Andrew's agent.
2. **Event-anchored intro.** Built on `wt/thrift-story` (from `wt/event-intro`): "find me someone to go to this plan with" returns 2 or 3 choices, and a double yes puts both on the plan. Owners: Alex (matching), with Andrew's agent (intros) and Rishab (the plan).
3. **Muse talks inside the 3D view.** The conversation, the choices, Jordan's rundown and "head there now" belong in a Muse panel on the 3D map, not in Messenger. The companion and its speech bubble are on main. Owners: Alan (panel and animation), Ally (Muse model), Alex (what Muse says).
4. **Two avatars walking together.** The joystick and the walk are on main. The missing part is each laptop seeing the other's avatar move live. Owner: Alan.
5. **Listing to plan link.** Posting a plan works on main. The missing part is starting it from the closet clean-out listing live. Owner: Rishab (#36).
6. **Arrival opens the selfie.** Arrival is detected on main but only shows a toast. It needs to open the photo capture, and the photo feeds the memory board and the rating. Owners: Alan (arrival), Ally (memory board, #19), Andrew's agent (rating, #18).

## Who carries which scenes

| Person | Scenes | Issues |
|---|---|---|
| Alex | 5, 6, 7: who Muse picks and what it says; 9: photo capture | #20, #21 |
| Alan | 3, 4, 7, 8, 9: 3D view, Muse panel, walk, arrival | #13, #24, #25 |
| Ally | 3, 4: the Muse and avatar models; 11: the memory board | #37, #19 |
| Rishab | 2: listing to closet sale plan | #36, #14 |
| Andrew's agent | the seed story, 5 (intros), 10 (rating), reasoning on screen, integration and deploys | #12, #18, #28, #38 |

## Not on stage (it stays in the app)

- The Messenger inbox as its own screen. Muse's conversation lives in the 3D panel instead.
- The Muse filter toggle on the 2D map.
- Groups, the Events discover page, and the Partiful-style plan page (#26).
- Marketplace "home now" pickups (#22), except the closet sale listing.
- Announcements (#27), Reels, Daily Quest, streaks, and Wrapped (#29).
- Real GPS (#40). The joystick drives the walk on stage.

## Decisions the team still needs to make

- **Who drives each laptop,** and who narrates.
