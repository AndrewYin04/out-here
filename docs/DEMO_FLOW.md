# Demo flow: the comic open house

The demo is Fri Nov 13, 10:30 AM PT: 5 minutes on stage, then 3 minutes of Q&A. This file is the plan for those 5 minutes. Any task that does not move one of the 11 scenes below waits until after the demo.

Status was checked against `origin/main` on Thu Nov 12 (after PRs #10, #39, #42 and #43 merged). Muse Intros and Messenger are on `overnight` and reach main with #17. Update a scene's status line when your work changes it.

## The story

Alex likes comics. Scrolling Facebook, he sees a seller's box of comics on Marketplace, and the seller has turned it into an open house today. Alex tells Muse he is free and wants someone to go with. Muse vets people and introduces Jordan, a stranger who also likes comics; the trust path is "you both know Maya". Both say yes. They walk there together on the 3D map, take a selfie, and each rates the hangout in private, so Muse matches better next time. Every scene below serves this one story.

Two laptops drive it: Alex on laptop A and Jordan on laptop B. A phone shows that it also works on mobile.

## Defaults (the team can override them on the gap issues)

- **Person 1** is Alex, on laptop A.
- **Person 2** is Jordan, on laptop B. Jordan and Alex are strangers. The trust path is "you both know Maya" (Jordan is Maya's roommate in the seed).
- **The seller** is a new fictional persona, Theo.
- **The open house** is "Comics open house" at Inkwell Comics Café, a fictional venue. It starts 30 minutes after the reseed and is about 9 minutes' walk from Alex.
- **The demo database** (`out-here-demo`) is reseeded a few hours before the demo, around Fri 6 to 7 AM PT, so dry runs use the real times.
- **The production URL** will be getouthere.vercel.app.

## Status key

- **Built**: merged to main, or in review.
- **Partly built**: some of the scene works on main, or the rest is on a teammate branch that has not been checked together with main.
- **Missing**: nothing on main does this scene yet.

## Act 1: Discover (0:00 to 0:40, proposed)

### Scene 1. Scrolling Facebook, a comics listing catches his eye

- **Screen:** laptop A.
- **The judge sees:** Alex opens Marketplace. It shows only what fits what he watches: "Picked by Muse from what you watch · comics · local music". Theo's box of comics is first, with Muse's reason ("You've watched 26 min of comics videos this week…") and "Why this?" showing the videos behind it. Muse hid the other 28 listings.
- **✨ Muse (live moment):** Alex opens Video, plays "35mm film for beginners" for 8 s, goes back: the 35mm film camera slides in as "New · You just watched…". A topic chip's ✕ removes its items (you control what Muse uses).
- **Status:** built on `feat/muse-watch-picks` (Rishab). The comics box shows once Theo's listing (`wt/event-intro`) reaches main; until then the picks are the bass and the film camera.
- **Exists:** Video page with Alex's seeded week of viewing (`src/shared/seed/videos.json`), `/api/muse/marketplace-picks` (Ember taste and picks, code checks every video, listing and number), migration 0008 `watch_events`.
- **Needs:** Theo's listing on main, and 0008 on the demo database before `seed:demo`.
- **Owners:** Rishab (Muse picks), Andrew's agent (seed).

### Scene 2. The seller makes it an open house

- **Screen:** Theo (either laptop, or pre-made in the seed).
- **The judge sees:** Theo turns the listing into "Comics open house, today": a plan linked to the item, live on the map.
- **✨ Muse:** fills in the title, time and invite copy from one sentence.
- **Status:** partly built.
- **Exists on main (PR #43, Rishab #36):** "＋ Post a plan" from the map with the Muse one-line draft, plan visibility, check-ins, reports, and the plan page `/out-here/plan/<id>`. A new plan appears on everyone's map over the `quests:new` channel.
- **Needs:** a link from a Marketplace listing to the plan, and the plan page showing the item. Until that lands, the seed links them with the quest tag `listing:<listingId>`.
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

### Scene 5. "The comic open house, but with someone who likes comics too"

- **Screen:** laptop A.
- **The judge sees:** Muse vets candidates while he watches the reasoning: shared interests, past hangouts, who wants to meet new people. Muse offers 2 or 3 choices, each with a one-line why.
- **✨ Muse:** this is the AI centerpiece. Agents vet each other, private hangout ratings count as signal, and every reason comes from real data.
- **Status:** partly built.
- **Exists:** on main, "who's free when you are" and plan together (PR #39). On `overnight` only, until #17 merges it to main: Muse Intros with agent vetting, the score bar and the trust path. Private hang-again answers are in review (#18).
- **Needs:** an intro anchored to this plan ("find me someone to go to this with"), and the choices shown in the 3D Muse panel.
- **Owners:** Alex (matching), Andrew's agent (intros), Rishab (the plan).

### Scene 6. Jordan gets the ping and says yes

- **Screen:** laptop B.
- **The judge sees:** a notification arrives on laptop B. Muse gives Jordan a rundown of Alex and why they would get along. Jordan says yes.
- **✨ Muse:** double opt-in. Nothing is shared until both say yes.
- **Status:** partly built.
- **Exists on `overnight` (main gets it with #17):** the intro notification, the intro card and Accept, live on both screens in about 2 seconds.
- **Needs:** the rundown and the Yes button in Jordan's Muse panel on the 3D map.
- **Owners:** Alex (what Muse says), Alan (panel).

### Scene 7. "It's happening. Head there now."

- **Screen:** both laptops.
- **The judge sees:** both screens show Muse confirming the plan at the same moment, with the walk time and a Go button.
- **Status:** partly built.
- **Exists on main:** the connected state, live seats, and the "It's a plan!" card with "Show on map" (PR #42).
- **Needs:** the "head there now" moment in the Muse panel on both screens, with Go starting the walk.
- **Owners:** Alan (panel), Alex (copy).

## Act 3: Meet (2:40 to 3:40, proposed)

### Scene 8. Walk there together on the 3D map

- **Screen:** both laptops.
- **The judge sees:** each person steers with a joystick. Each sees the other's avatar moving toward the open house, and the walk minutes count down.
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

1. **The comic story in the seed.** No comics exist anywhere yet: no listing, no Theo, no open house, no hangout history for two comic fans. Every scene depends on it. Owner: Andrew's agent (it owns the seed; builder on `wt/comic-seed`).
2. **Event-anchored intro.** Muse Intros match people in general. The demo needs "find me someone to go to this plan with", which joins Rishab's plan, Alex's matching and the intro double opt-in. Owners: Alex (matching), with Andrew's agent (intros) and Rishab (the plan).
3. **Muse talks inside the 3D view.** The conversation, the choices, Jordan's rundown and "head there now" belong in a Muse panel on the 3D map, not in Messenger. The companion and its speech bubble are on main. Owners: Alan (panel and animation), Ally (Muse model), Alex (what Muse says).
4. **Two avatars walking together.** The joystick and the walk are on main. The missing part is each laptop seeing the other's avatar move live. Owner: Alan.
5. **Listing to plan link.** Posting a plan works on main. The missing part is starting it from the comics listing and showing the item on the plan page. Owner: Rishab (#36).
6. **Arrival opens the selfie.** Arrival is detected on main but only shows a toast. It needs to open the photo capture, and the photo feeds the memory board and the rating. Owners: Alan (arrival), Ally (memory board, #19), Andrew's agent (rating, #18).

## Who carries which scenes

| Person | Scenes | Issues |
|---|---|---|
| Alex | 5, 6, 7: who Muse picks and what it says; 9: photo capture | #20, #21 |
| Alan | 3, 4, 7, 8, 9: 3D view, Muse panel, walk, arrival | #13, #24, #25 |
| Ally | 3, 4: the Muse and avatar models; 11: the memory board | #37, #19 |
| Rishab | 2: listing to open house plan | #36, #14 |
| Andrew's agent | the seed story, 5 (intros), 10 (rating), reasoning on screen, integration and deploys | #12, #18, #28, #38 |

## Not on stage (it stays in the app)

- The Messenger inbox as its own screen. Muse's conversation lives in the 3D panel instead.
- The Muse filter toggle on the 2D map.
- Groups, the Events discover page, and the Partiful-style plan page (#26).
- Marketplace "home now" pickups (#22), except the one comics listing.
- Announcements (#27), Reels, Daily Quest, streaks, and Wrapped (#29).
- Real GPS (#40). The joystick drives the walk on stage.

## Decisions the team still needs to make

- **The people.** The defaults above are Alex, Jordan and Theo. Override them on the seed issue if you disagree.
- **The open house time.** The default is 30 minutes after the reseed. It must start soon for the spontaneity to land.
- **The selfie on stage.** Live laptop camera, or a prepared photo picked from a file?
- **Which scenes may be pre-staged.** For example, Theo's open house already exists and scene 2 takes 10 seconds, to protect the time for Act 2.
- **Who drives each laptop,** and who narrates.
